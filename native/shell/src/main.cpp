#include <windows.h>
#include <shellapi.h>
#include <winhttp.h>
#pragma comment(lib, "winhttp.lib")

#include <algorithm>
#include <filesystem>
#include <optional>
#include <random>
#include <sstream>
#include <string>
#include <vector>
#include <cwchar>
#include <cstring>

#include "lumesync/shared.h"
#include "resource.h"

#if __has_include(<WebView2.h>)
#define LUMESYNC_HAS_WEBVIEW2 1
#include <WebView2.h>
#include <WebView2EnvironmentOptions.h>
#include <wrl.h>
using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
#else
#define LUMESYNC_HAS_WEBVIEW2 0
#endif

namespace {

using lumesync::TeacherConfig;
using lumesync::TeacherWindowSettings;

constexpr wchar_t kMainWindowClassName[] = L"LumeSyncTeacherShellWindow";
constexpr wchar_t kMainInstanceMutex[] = L"Global\\LumeSyncTeacherShell.Main";
constexpr int kMinTeacherWindowWidth = 1360;
constexpr int kMinTeacherWindowHeight = 860;
constexpr int kMinClassroomWindowWidth = 1560;
constexpr int kMinClassroomWindowHeight = 980;

struct StartupWindowOptions {
  bool childWindow = false;
  std::wstring mode;
  std::wstring title = L"LumeSync Teacher";
  int width = 0;
  int height = 0;
};

class TeacherShellApp;
TeacherShellApp* g_app = nullptr;

std::filesystem::path ExePath() {
  std::wstring buffer(MAX_PATH, L'\0');
  DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  while (length == buffer.size()) {
    buffer.resize(buffer.size() * 2);
    length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
  }
  buffer.resize(length);
  return buffer;
}

std::filesystem::path ExeDir() {
  return ExePath().parent_path();
}

bool ActivateExistingInstance() {
  HWND existing = FindWindowW(kMainWindowClassName, nullptr);
  if (!existing) return false;
  ShowWindow(existing, SW_RESTORE);
  SetForegroundWindow(existing);
  return true;
}

HANDLE AcquireInstanceMutex() {
  HANDLE mutex = CreateMutexW(nullptr, TRUE, kMainInstanceMutex);
  if (!mutex) return nullptr;
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    CloseHandle(mutex);
    return nullptr;
  }
  return mutex;
}

void EnableDpiAwareness() {
  if (!SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
    SetProcessDPIAware();
  }
}

RECT DefaultWindowRect() {
  RECT workArea = {};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
  const int availableWidth = workArea.right - workArea.left;
  const int availableHeight = workArea.bottom - workArea.top;
  const int width = min(max(1280, availableWidth * 85 / 100), availableWidth);
  const int height = min(max(800, availableHeight * 85 / 100), availableHeight);
  const int x = workArea.left + max(0, (availableWidth - width) / 2);
  const int y = workArea.top + max(0, (availableHeight - height) / 2);
  return RECT{x, y, x + width, y + height};
}

RECT CenteredWindowRect(int requestedWidth, int requestedHeight) {
  RECT workArea = {};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
  const int availableWidth = workArea.right - workArea.left;
  const int availableHeight = workArea.bottom - workArea.top;
  const int targetWidth = max(requestedWidth, 720);
  const int targetHeight = max(requestedHeight, 540);

  int width = targetWidth;
  int height = targetHeight;
  if (width > availableWidth || height > availableHeight) {
    const double widthScale = static_cast<double>(availableWidth) / static_cast<double>(width);
    const double heightScale = static_cast<double>(availableHeight) / static_cast<double>(height);
    const double scale = min(widthScale, heightScale);
    width = max(720, static_cast<int>(width * scale));
    height = max(540, static_cast<int>(height * scale));
    if (width > availableWidth) width = availableWidth;
    if (height > availableHeight) height = availableHeight;
  }

  const int x = workArea.left + max(0, (availableWidth - width) / 2);
  const int y = workArea.top + max(0, (availableHeight - height) / 2);
  return RECT{x, y, x + width, y + height};
}

SIZE MinimumWindowSizeForMode(const std::wstring& mode) {
  if (mode == L"classroom") {
    return SIZE{ kMinClassroomWindowWidth, kMinClassroomWindowHeight };
  }
  return SIZE{ kMinTeacherWindowWidth, kMinTeacherWindowHeight };
}

std::wstring QuoteCommandArg(const std::wstring& value) {
  std::wstring escaped = L"\"";
  for (const wchar_t ch : value) {
    if (ch == L'"') escaped += L"\\\"";
    else escaped.push_back(ch);
  }
  escaped += L"\"";
  return escaped;
}

StartupWindowOptions ParseStartupWindowOptions() {
  StartupWindowOptions options;
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (!argv) return options;

  for (int index = 1; index < argc; ++index) {
    const std::wstring arg = argv[index] ? argv[index] : L"";
    if (arg == L"--child-window") {
      options.childWindow = true;
    } else if (arg == L"--window-mode" && index + 1 < argc) {
      options.mode = argv[++index] ? argv[index] : L"";
    } else if (arg == L"--window-title" && index + 1 < argc) {
      options.title = argv[++index] ? argv[index] : L"";
    } else if (arg == L"--window-width" && index + 1 < argc) {
      options.width = _wtoi(argv[++index] ? argv[index] : L"0");
    } else if (arg == L"--window-height" && index + 1 < argc) {
      options.height = _wtoi(argv[++index] ? argv[index] : L"0");
    }
  }

  LocalFree(argv);
  return options;
}

std::optional<std::filesystem::path> FindUiAsset(const std::wstring& fileName) {
  const std::vector<std::filesystem::path> candidates = {
      ExeDir() / L"resources" / L"ui" / fileName,
      ExeDir() / L"ui" / fileName,
      std::filesystem::current_path() / L"shared" / L"public" / fileName,
      std::filesystem::current_path() / L"public" / fileName,
  };
  for (const auto& candidate : candidates) {
    if (std::filesystem::exists(candidate)) return candidate;
  }
  return std::nullopt;
}

std::wstring ToFileUrl(const std::filesystem::path& path) {
  std::wstring value = std::filesystem::absolute(path).wstring();
  std::replace(value.begin(), value.end(), L'\\', L'/');
  if (value.rfind(L"//", 0) == 0) return L"file:" + value;
  return L"file:///" + value;
}

bool IsLoopbackHost(const std::wstring& host) {
  std::wstring normalized = host;
  std::transform(normalized.begin(), normalized.end(), normalized.begin(), towlower);
  return normalized == L"127.0.0.1" || normalized == L"localhost" || normalized == L"::1";
}

std::optional<std::filesystem::path> FindExistingPath(const std::vector<std::filesystem::path>& candidates) {
  for (const auto& candidate : candidates) {
    if (std::filesystem::exists(candidate)) return candidate;
  }
  return std::nullopt;
}

std::optional<std::filesystem::path> FindTeacherServerEntry() {
  return FindExistingPath({
      ExeDir() / L"server" / L"index.js",
      ExeDir().parent_path().parent_path().parent_path().parent_path().parent_path() / L"server" / L"index.js",
      std::filesystem::current_path() / L"server" / L"index.js",
  });
}

std::optional<std::filesystem::path> FindNodeModulesDir() {
  return FindExistingPath({
      ExeDir() / L"node_modules",
      ExeDir().parent_path().parent_path().parent_path().parent_path().parent_path() / L"node_modules",
      std::filesystem::current_path() / L"node_modules",
      std::filesystem::current_path().parent_path() / L"node_modules",
  });
}

std::optional<std::filesystem::path> FindSharedPublicDir() {
  return FindExistingPath({
      ExeDir() / L"shared" / L"public",
      ExeDir().parent_path().parent_path().parent_path().parent_path().parent_path() / L"shared" / L"public",
      std::filesystem::current_path() / L"shared" / L"public",
  });
}

std::wstring RandomHex(std::size_t length) {
  static constexpr wchar_t kHex[] = L"0123456789abcdef";
  std::random_device device;
  std::mt19937 generator(device());
  std::uniform_int_distribution<int> distribution(0, 15);

  std::wstring value;
  value.reserve(length);
  for (std::size_t index = 0; index < length; ++index) {
    value.push_back(kHex[distribution(generator)]);
  }
  return value;
}

std::wstring FindNodeExecutable() {
  std::wstring buffer(MAX_PATH, L'\0');
  DWORD length = SearchPathW(nullptr, L"node.exe", nullptr, static_cast<DWORD>(buffer.size()), buffer.data(), nullptr);
  while (length > buffer.size()) {
    buffer.resize(length, L'\0');
    length = SearchPathW(nullptr, L"node.exe", nullptr, static_cast<DWORD>(buffer.size()), buffer.data(), nullptr);
  }
  if (length == 0) return L"";
  buffer.resize(length);
  return buffer;
}

struct BootstrapSessionResult {
  bool ok = false;
  std::wstring token;
  std::wstring expiresAt;
  std::wstring serverTime;
  std::wstring clientId;
  std::wstring error;
};

std::wstring WinHttpReadAll(HINTERNET request) {
  std::string body;
  DWORD available = 0;
  do {
    available = 0;
    if (!WinHttpQueryDataAvailable(request, &available)) return L"";
    if (available == 0) break;
    std::string chunk(available, '\0');
    DWORD read = 0;
    if (!WinHttpReadData(request, chunk.data(), available, &read)) return L"";
    chunk.resize(read);
    body += chunk;
  } while (available > 0);
  return lumesync::Utf8Decode(body);
}

BootstrapSessionResult BootstrapHostSession(const TeacherConfig& config) {
  BootstrapSessionResult result;
  HINTERNET session = WinHttpOpen(L"LumeSyncTeacher/1.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) {
    result.error = L"WinHttpOpen failed";
    return result;
  }

  HINTERNET connect = WinHttpConnect(session, L"127.0.0.1", static_cast<INTERNET_PORT>(config.port), 0);
  if (!connect) {
    result.error = L"WinHttpConnect failed";
    WinHttpCloseHandle(session);
    return result;
  }

  HINTERNET request = WinHttpOpenRequest(connect, L"POST", L"/api/session/bootstrap", nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
  if (!request) {
    result.error = L"WinHttpOpenRequest failed";
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return result;
  }

  const std::wstring payload = L"{\"role\":\"host\",\"clientId\":\"" + lumesync::JsonEscape(config.clientId) + L"\"}";
  const std::wstring headers = L"Content-Type: application/json\r\n";
  const std::string payloadUtf8 = lumesync::Utf8Encode(payload);
  const BOOL sent = WinHttpSendRequest(
      request,
      headers.c_str(),
      static_cast<DWORD>(headers.size()),
      payloadUtf8.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<char*>(payloadUtf8.data()),
      static_cast<DWORD>(payloadUtf8.size()),
      static_cast<DWORD>(payloadUtf8.size()),
      0);
  if (!sent || !WinHttpReceiveResponse(request, nullptr)) {
    result.error = L"bootstrap request failed";
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return result;
  }

  DWORD statusCode = 0;
  DWORD statusSize = sizeof(statusCode);
  WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX);
  const std::wstring response = WinHttpReadAll(request);

  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);

  if (statusCode < 200 || statusCode >= 300) {
    result.error = lumesync::JsonStringField(response, L"error").value_or(L"bootstrap http error");
    return result;
  }

  const bool success = lumesync::JsonBoolField(response, L"success").value_or(false);
  const std::wstring role = lumesync::JsonStringField(response, L"role").value_or(L"");
  result.clientId = lumesync::JsonStringField(response, L"clientId").value_or(L"");
  result.token = lumesync::JsonStringField(response, L"token").value_or(L"");
  result.expiresAt = lumesync::JsonStringField(response, L"expiresAt").value_or(L"");
  result.serverTime = lumesync::JsonStringField(response, L"serverTime").value_or(L"");

  if (!success || role != L"host" || result.clientId.empty() || result.token.empty()) {
    result.error = L"bootstrap payload invalid";
    return result;
  }

  result.ok = true;
  return result;
}

std::wstring HostApiScript() {
  return LR"JS(
(() => {
  if (!window.chrome?.webview || window.teacherHost?.__native) return;
  let nextId = 1;
  const pending = new Map();
  function rpc(action, payload) {
    const id = `rpc-${Date.now()}-${nextId++}`;
    window.chrome.webview.postMessage({ kind: 'rpc', id, action, payload: payload ?? {} });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Native RPC timed out: ${action}`));
      }, 10000);
    });
  }
  function send(action, payload) {
    window.chrome.webview.postMessage({ kind: 'event', action, payload: payload ?? {} });
  }
  window.chrome.webview.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.kind !== 'rpc-result' || !pending.has(message.id)) return;
    const pendingCall = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok === false) pendingCall.reject(new Error(message.error || 'Native RPC failed'));
    else pendingCall.resolve(message.payload);
  });
  const listeners = { maximized: new Set(), unmaximized: new Set() };
  const api = {
    __native: true,
    classStarted: (options) => send('classStarted', options || {}),
    classEnded: () => send('classEnded'),
    setFullscreen: (enable) => send('setFullscreen', { enable: !!enable }),
    getConfig: () => rpc('getConfig'),
    saveConfig: (config) => rpc('saveConfig', config || {}),
    verifyPassword: (password) => rpc('verifyPassword', { password }),
    getRole: () => Promise.resolve('host'),
    getSession: () => rpc('getSession'),
    bootstrapSession: () => rpc('bootstrapSession'),
    getSettings: () => rpc('getSettings'),
    saveSettings: (settings) => rpc('saveSettings', settings || {}),
    importCourse: () => rpc('importCourse'),
    exportCourse: (payload) => rpc('exportCourse', payload || {}),
    openLogDir: () => rpc('openLogDir'),
    getLogDir: () => rpc('getLogDir'),
    selectSubmissionDir: () => rpc('selectSubmissionDir'),
    toggleDevTools: () => send('toggleDevTools'),
    minimizeWindow: () => send('minimizeWindow'),
    maximizeWindow: () => send('maximizeWindow'),
    closeWindow: () => send('closeWindow'),
    openWindow: (url, options) => send('openWindow', {
      mode: typeof options?.mode === 'string' ? options.mode : '',
      width: Number(options?.width) || 0,
      height: Number(options?.height) || 0,
      title: typeof options?.title === 'string' ? options.title : ''
    }),
    beginWindowDrag: (payload) => send('beginWindowDrag', payload || {}),
    updateWindowDrag: (payload) => send('updateWindowDrag', payload || {}),
    endWindowDrag: () => send('endWindowDrag'),
    onWindowMaximized: (callback) => { if (typeof callback === 'function') listeners.maximized.add(callback); },
    onWindowUnmaximized: (callback) => { if (typeof callback === 'function') listeners.unmaximized.add(callback); },
    removeWindowMaximizedListener: (callback) => listeners.maximized.delete(callback),
    removeWindowUnmaximizedListener: (callback) => listeners.unmaximized.delete(callback),
  };
  window.teacherHost = api;
  window.electronAPI = Object.assign({}, window.electronAPI || {}, api);
  window.openWindow = api.openWindow;
  window.closeWindow = api.closeWindow;
  window.chrome.webview.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.kind === 'window-maximized') {
      listeners.maximized.forEach((callback) => callback());
    } else if (message.kind === 'window-unmaximized') {
      listeners.unmaximized.forEach((callback) => callback());
    }
  });
})();
)JS";
}

std::wstring WindowModeScript(const std::wstring& mode) {
  return L"window.__LumeSyncWindowMode = \"" + lumesync::JsonEscape(mode.empty() ? L"main" : mode) + L"\";";
}

class TeacherShellApp {
 public:
  struct ChildProcess {
    PROCESS_INFORMATION process = {};

    bool running() const {
      return process.hProcess != nullptr;
    }

    void CloseHandles() {
      if (process.hThread) {
        CloseHandle(process.hThread);
        process.hThread = nullptr;
      }
      if (process.hProcess) {
        CloseHandle(process.hProcess);
        process.hProcess = nullptr;
      }
      process.dwProcessId = 0;
      process.dwThreadId = 0;
    }
  };

  struct SessionSecrets {
    std::wstring hostToken = L"teacher-host-" + RandomHex(48);
    std::wstring viewerSecret = L"teacher-viewer-" + RandomHex(64);
  };

 public:
  explicit TeacherShellApp(HINSTANCE instance, const StartupWindowOptions& startupOptions)
      : instance_(instance), config_(lumesync::LoadConfig()), settings_(lumesync::LoadWindowSettings()), startupOptions_(startupOptions) {
    g_app = this;
  }

  ~TeacherShellApp() {
    g_app = nullptr;
  }

  bool Initialize(int nCmdShow) {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.hInstance = instance_;
    wc.lpszClassName = kMainWindowClassName;
    wc.lpfnWndProc = &TeacherShellApp::WindowProc;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(IDI_LUMESYNC_TEACHER));
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
      lumesync::AppendLog(L"shell", L"RegisterClassExW failed: " + std::to_wstring(GetLastError()));
      return false;
    }

    const RECT rect = (startupOptions_.width > 0 && startupOptions_.height > 0)
        ? CenteredWindowRect(startupOptions_.width, startupOptions_.height)
        : DefaultWindowRect();
    hwnd_ = CreateWindowExW(
        0,
        kMainWindowClassName,
        startupOptions_.title.empty() ? L"LumeSync Teacher" : startupOptions_.title.c_str(),
        WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_CLIPCHILDREN,
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top,
        nullptr,
        nullptr,
        instance_,
        this);
    if (!hwnd_) {
      lumesync::AppendLog(L"shell", L"CreateWindowExW failed: " + std::to_wstring(GetLastError()));
      return false;
    }

    ShowWindow(hwnd_, nCmdShow);
    UpdateWindow(hwnd_);
    return true;
  }

  int Run() {
    MSG msg = {};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    return static_cast<int>(msg.wParam);
  }

 private:
  static LRESULT CALLBACK WindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    TeacherShellApp* self = nullptr;
    if (message == WM_NCCREATE) {
      auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
      self = reinterpret_cast<TeacherShellApp*>(create->lpCreateParams);
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
      self->hwnd_ = hwnd;
    } else {
      self = reinterpret_cast<TeacherShellApp*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }
    if (!self) return DefWindowProcW(hwnd, message, wParam, lParam);
    return self->HandleMessage(message, wParam, lParam);
  }

  LRESULT HandleMessage(UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
      case WM_CREATE:
        InitializeWebView();
        return 0;
      case WM_SIZE:
        ResizeBrowser();
        NotifyWindowState();
        return 0;
      case WM_GETMINMAXINFO: {
        auto* info = reinterpret_cast<MINMAXINFO*>(lParam);
        if (!info) return 0;
        const SIZE minSize = MinimumWindowSizeForMode(startupOptions_.mode);
        info->ptMinTrackSize.x = minSize.cx;
        info->ptMinTrackSize.y = minSize.cy;
        return 0;
      }
      case WM_CLOSE:
        DestroyWindow(hwnd_);
        return 0;
      case WM_DESTROY:
        Shutdown();
        PostQuitMessage(0);
        return 0;
      default:
        return DefWindowProcW(hwnd_, message, wParam, lParam);
    }
  }

  bool WaitForLocalServer(DWORD timeoutMs) {
    const DWORD deadline = GetTickCount() + timeoutMs;
    while (true) {
      HINTERNET session = WinHttpOpen(L"LumeSyncTeacher/1.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
      if (session) {
        HINTERNET connect = WinHttpConnect(session, L"127.0.0.1", static_cast<INTERNET_PORT>(config_.port), 0);
        if (connect) {
          HINTERNET request = WinHttpOpenRequest(connect, L"GET", L"/api/health", nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
          if (request) {
            BOOL sent = WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0);
            if (sent && WinHttpReceiveResponse(request, nullptr)) {
              DWORD statusCode = 0;
              DWORD statusSize = sizeof(statusCode);
              WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX);
              WinHttpCloseHandle(request);
              WinHttpCloseHandle(connect);
              WinHttpCloseHandle(session);
              if (statusCode >= 200 && statusCode < 500) return true;
            } else {
              WinHttpCloseHandle(request);
            }
          }
          WinHttpCloseHandle(connect);
        }
        WinHttpCloseHandle(session);
      }

      if (GetTickCount() >= deadline) return false;
      Sleep(200);
    }
  }

  bool StartLocalServerIfNeeded() {
    config_ = lumesync::LoadConfig();
    if (WaitForLocalServer(200)) return true;
    if (serverProcess_.running()) return WaitForLocalServer(8000);

    const auto serverEntry = FindTeacherServerEntry();
    if (!serverEntry) {
      lumesync::AppendLog(L"shell", L"Teacher server entry not found");
      return false;
    }

    const std::wstring nodeExe = FindNodeExecutable();
    if (nodeExe.empty()) {
      lumesync::AppendLog(L"shell", L"node.exe not found in PATH");
      return false;
    }

    std::wstring command = L"\"" + nodeExe + L"\" \"" + serverEntry->wstring() + L"\"";
    const auto nodeModulesDir = FindNodeModulesDir();
    const auto sharedPublicDir = FindSharedPublicDir();
    std::wstring environmentBlock;
    const auto appendEnv = [&](const std::wstring& key, const std::wstring& value) {
      environmentBlock += key + L"=" + value;
      environmentBlock.push_back(L'\0');
    };
    for (wchar_t* env = GetEnvironmentStringsW(); env && *env; env += wcslen(env) + 1) {
      environmentBlock.append(env, wcslen(env));
      environmentBlock.push_back(L'\0');
    }
    appendEnv(L"PORT", std::to_wstring(config_.port));
    appendEnv(L"ELECTRON_RUN_AS_NODE", L"1");
    appendEnv(L"LOG_DIR", (lumesync::ProgramDataDir() / L"logs").wstring());
    appendEnv(L"LUMESYNC_HOST_TOKEN", sessionSecrets_.hostToken);
    appendEnv(L"LUMESYNC_VIEWER_TOKEN_SECRET", sessionSecrets_.viewerSecret);
    if (nodeModulesDir) appendEnv(L"NODE_PATH", nodeModulesDir->wstring());
    if (sharedPublicDir) {
      appendEnv(L"STATIC_DIR", sharedPublicDir->wstring());
      appendEnv(L"LUMESYNC_PUBLIC_DIR", sharedPublicDir->wstring());
    }
    environmentBlock.push_back(L'\0');

    STARTUPINFOW startup = { sizeof(startup) };
    startup.dwFlags = STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_HIDE;
    std::wstring mutableCommand = command;
    const BOOL created = CreateProcessW(
        nullptr,
        mutableCommand.data(),
        nullptr,
        nullptr,
        FALSE,
        CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
        environmentBlock.data(),
        serverEntry->parent_path().wstring().c_str(),
        &startup,
        &serverProcess_.process);
    if (!created) {
      lumesync::AppendLog(L"shell", L"Failed to create local teacher server process");
      serverProcess_.CloseHandles();
      return false;
    }

    return WaitForLocalServer(10000);
  }

  void InitializeWebView() {
#if LUMESYNC_HAS_WEBVIEW2
    using CreateEnvironmentFn = HRESULT(STDAPICALLTYPE*)(PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions*, ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);

    webviewLoader_ = LoadLibraryW(L"WebView2Loader.dll");
    if (!webviewLoader_) {
      return;
    }

    auto* createEnvironment = reinterpret_cast<CreateEnvironmentFn>(GetProcAddress(webviewLoader_, "CreateCoreWebView2EnvironmentWithOptions"));
    if (!createEnvironment) {
      return;
    }

    const auto dataFolder = (lumesync::ProgramDataDir() / L"webview2").wstring();
    auto options = Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();
    const HRESULT hr = createEnvironment(
        nullptr,
        dataFolder.c_str(),
        options.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [this](HRESULT result, ICoreWebView2Environment* environment) -> HRESULT {
              if (FAILED(result) || !environment) return S_OK;
              return environment->CreateCoreWebView2Controller(
                  hwnd_,
                  Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                      [this](HRESULT controllerResult, ICoreWebView2Controller* controller) -> HRESULT {
                        if (FAILED(controllerResult) || !controller) return S_OK;
                        webviewController_ = controller;
                        webviewController_->get_CoreWebView2(&webview_);
                        RegisterBrowserEvents();
                        ResizeBrowser();
                        return S_OK;
                      })
                      .Get());
            })
            .Get());
    (void)hr;
#endif
  }

  void RegisterBrowserEvents() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_) return;
    webview_->AddScriptToExecuteOnDocumentCreated(
        HostApiScript().c_str(),
        Callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>(
            [this](HRESULT, LPCWSTR) -> HRESULT {
              webview_->AddScriptToExecuteOnDocumentCreated(
                  WindowModeScript(startupOptions_.mode).c_str(),
                  Callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>(
                      [this](HRESULT, LPCWSTR) -> HRESULT {
                        NavigateTeacher();
                        return S_OK;
                      })
                      .Get());
              return S_OK;
            })
            .Get());

    EventRegistrationToken token = {};
    webview_->add_WebMessageReceived(
        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
              LPWSTR raw = nullptr;
              if (SUCCEEDED(args->get_WebMessageAsJson(&raw)) && raw != nullptr) {
                HandleWebMessage(raw);
                CoTaskMemFree(raw);
              }
              return S_OK;
            })
            .Get(),
        &token);
#endif
  }

  void ResizeBrowser() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webviewController_) return;
    RECT bounds = {};
    GetClientRect(hwnd_, &bounds);
    webviewController_->put_Bounds(bounds);
#endif
  }

  void NavigateTeacher() {
#if LUMESYNC_HAS_WEBVIEW2
    config_ = lumesync::LoadConfig();
    if (!webview_) return;
    const bool serverReady = StartLocalServerIfNeeded();
    BootstrapSession();
    if (serverReady) {
      webview_->Navigate(lumesync::BuildTeacherUrl(config_).c_str());
    }
#endif
  }

  void Shutdown() {
#if LUMESYNC_HAS_WEBVIEW2
    webview_.Reset();
    webviewController_.Reset();
    if (webviewLoader_) {
      FreeLibrary(webviewLoader_);
      webviewLoader_ = nullptr;
    }
#endif
    if (serverProcess_.running()) {
      TerminateProcess(serverProcess_.process.hProcess, 0);
      WaitForSingleObject(serverProcess_.process.hProcess, 3000);
      serverProcess_.CloseHandles();
    }
  }

  void HandleWebMessage(const std::wstring& json) {
    const auto action = lumesync::JsonStringField(json, L"action");
    if (!action) return;
    const auto kind = lumesync::JsonStringField(json, L"kind").value_or(L"event");
    const auto id = lumesync::JsonStringField(json, L"id").value_or(L"");
    const auto payload = lumesync::JsonObjectField(json, L"payload").value_or(L"{}");
    if (kind == L"rpc") HandleRpc(id, *action, payload);
    else HandleEvent(*action, payload);
  }

  void HandleEvent(const std::wstring& action, const std::wstring& payload = L"{}") {
    if (action == L"toggleDevTools") {
      OpenDevTools();
    } else if (action == L"minimizeWindow") {
      ShowWindow(hwnd_, SW_MINIMIZE);
    } else if (action == L"maximizeWindow") {
      ShowWindow(hwnd_, IsZoomed(hwnd_) ? SW_RESTORE : SW_MAXIMIZE);
    } else if (action == L"closeWindow") {
      PostMessageW(hwnd_, WM_CLOSE, 0, 0);
    } else if (action == L"openWindow") {
      OpenChildWindow(payload);
    } else if (action == L"beginWindowDrag") {
      BeginWindowDrag(payload);
    } else if (action == L"updateWindowDrag") {
      UpdateWindowDrag(payload);
    } else if (action == L"endWindowDrag") {
      EndWindowDrag();
    }
  }

  void BeginWindowDrag(const std::wstring& payload) {
    UNREFERENCED_PARAMETER(payload);
    if (!hwnd_) return;
    SetForegroundWindow(hwnd_);
    ReleaseCapture();
    SendMessageW(hwnd_, WM_NCLBUTTONDOWN, HTCAPTION, 0);
  }

  void UpdateWindowDrag(const std::wstring& payload) {
    UNREFERENCED_PARAMETER(payload);
  }

  void EndWindowDrag() {
  }

  void OpenChildWindow(const std::wstring& payload) {
    const std::wstring requestedMode = lumesync::JsonStringField(payload, L"mode").value_or(L"");
    if (requestedMode.empty()) return;

    std::wstring commandLine = QuoteCommandArg(ExePath().wstring()) + L" --child-window --window-mode " + QuoteCommandArg(requestedMode);

    const std::wstring title = lumesync::JsonStringField(payload, L"title").value_or(L"");
    if (!title.empty()) commandLine += L" --window-title " + QuoteCommandArg(title);

    const int width = lumesync::JsonIntField(payload, L"width").value_or(0);
    if (width > 0) commandLine += L" --window-width " + std::to_wstring(width);

    const int height = lumesync::JsonIntField(payload, L"height").value_or(0);
    if (height > 0) commandLine += L" --window-height " + std::to_wstring(height);

    STARTUPINFOW startupInfo = {};
    startupInfo.cb = sizeof(startupInfo);
    PROCESS_INFORMATION processInfo = {};
    std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
    mutableCommand.push_back(L'\0');

    const BOOL created = CreateProcessW(
        nullptr,
        mutableCommand.data(),
        nullptr,
        nullptr,
        FALSE,
        0,
        nullptr,
        ExeDir().wstring().c_str(),
        &startupInfo,
        &processInfo);
    if (!created) {
      lumesync::AppendLog(L"shell", L"Create child window process failed: " + std::to_wstring(GetLastError()));
      return;
    }

    CloseHandle(processInfo.hThread);
    CloseHandle(processInfo.hProcess);
  }

  bool BootstrapSession() {
    config_ = lumesync::LoadConfig();
    const bool hadClientId = !config_.clientId.empty();
    lumesync::EnsureClientId(config_);
    if (!hadClientId) lumesync::SaveConfig(config_);

    const BootstrapSessionResult result = BootstrapHostSession(config_);
    if (!result.ok) {
      config_.sessionToken.clear();
      config_.sessionExpiresAt.clear();
      config_.sessionServerTime.clear();
      lumesync::SaveConfig(config_);
      lumesync::AppendLog(L"shell", L"Host session bootstrap failed: " + result.error);
      return false;
    }

    config_.clientId = result.clientId;
    config_.sessionToken = result.token;
    config_.sessionExpiresAt = result.expiresAt;
    config_.sessionServerTime = result.serverTime;
    lumesync::SaveConfig(config_);
    return true;
  }

  std::wstring SessionPayloadJson() {
    config_ = lumesync::LoadConfig();
    if (config_.clientId.empty() || config_.sessionToken.empty()) return L"null";
    std::wostringstream json;
    json << L"{"
         << L"\"role\":\"host\","
         << L"\"clientId\":\"" << lumesync::JsonEscape(config_.clientId) << L"\","
         << L"\"token\":\"" << lumesync::JsonEscape(config_.sessionToken) << L"\"";
    if (!config_.sessionExpiresAt.empty()) json << L",\"expiresAt\":\"" << lumesync::JsonEscape(config_.sessionExpiresAt) << L"\"";
    if (!config_.sessionServerTime.empty()) json << L",\"serverTime\":\"" << lumesync::JsonEscape(config_.sessionServerTime) << L"\"";
    json << L"}";
    return json.str();
  }

  void HandleRpc(const std::wstring& id, const std::wstring& action, const std::wstring& payload) {
    if (action == L"getConfig") {
      config_ = lumesync::LoadConfig();
      SendRpcResult(id, true, BuildConfigJson());
    } else if (action == L"saveConfig") {
      config_ = lumesync::LoadConfig();
      if (auto value = lumesync::JsonStringField(payload, L"teacherIp"); value && !value->empty()) config_.teacherIp = *value;
      if (auto value = lumesync::JsonIntField(payload, L"port")) config_.port = *value;
      if (auto value = lumesync::JsonStringField(payload, L"adminPasswordHash"); value && !value->empty()) config_.adminPasswordHash = *value;
      const bool saved = lumesync::SaveConfig(config_);
      if (saved) NavigateTeacher();
      SendRpcResult(id, saved, saved ? L"true" : L"false");
    } else if (action == L"verifyPassword") {
      config_ = lumesync::LoadConfig();
      const std::wstring password = lumesync::JsonStringField(payload, L"password").value_or(L"");
      const bool ok = lumesync::Sha256Hex(password) == (config_.adminPasswordHash.empty() ? lumesync::DefaultAdminPasswordHash() : config_.adminPasswordHash);
      SendRpcResult(id, true, ok ? L"{\"ok\":true}" : L"{\"ok\":false}");
    } else if (action == L"getRole") {
      SendRpcResult(id, true, L"\"host\"");
    } else if (action == L"getSession") {
      SendRpcResult(id, true, SessionPayloadJson());
    } else if (action == L"bootstrapSession") {
      const bool ok = BootstrapSession();
      SendRpcResult(id, ok, ok ? SessionPayloadJson() : L"null", ok ? L"" : L"bootstrap failed");
    } else if (action == L"getSettings") {
      settings_ = lumesync::LoadWindowSettings();
      SendRpcResult(id, true, BuildSettingsJson());
    } else if (action == L"saveSettings") {
      settings_ = lumesync::LoadWindowSettings();
      if (auto value = lumesync::JsonBoolField(payload, L"forceFullscreen")) settings_.forceFullscreen = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"syncFollow")) settings_.syncFollow = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"allowInteract")) settings_.allowInteract = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"syncInteraction")) settings_.syncInteraction = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"podiumAtTop")) settings_.podiumAtTop = *value;
      if (auto value = lumesync::JsonDoubleField(payload, L"renderScale")) settings_.renderScale = *value;
      if (auto value = lumesync::JsonDoubleField(payload, L"uiScale")) settings_.uiScale = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"alertJoin")) settings_.alertJoin = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"alertLeave")) settings_.alertLeave = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"alertFullscreenExit")) settings_.alertFullscreenExit = *value;
      if (auto value = lumesync::JsonBoolField(payload, L"alertTabHidden")) settings_.alertTabHidden = *value;
      const bool saved = lumesync::SaveWindowSettings(settings_);
      SendRpcResult(id, saved, saved ? L"true" : L"false");
    } else if (action == L"openLogDir") {
      const auto logDir = lumesync::ProgramDataDir() / L"logs";
      ShellExecuteW(nullptr, L"open", logDir.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
      SendRpcResult(id, true, L"\"" + lumesync::JsonEscape(logDir.wstring()) + L"\"");
    } else if (action == L"getLogDir") {
      const auto logDir = lumesync::ProgramDataDir() / L"logs";
      SendRpcResult(id, true, L"\"" + lumesync::JsonEscape(logDir.wstring()) + L"\"");
    } else if (action == L"selectSubmissionDir" || action == L"importCourse" || action == L"exportCourse") {
      SendRpcResult(id, true, L"null");
    } else {
      SendRpcResult(id, false, L"null", L"unknown action");
    }
  }

  std::wstring BoolJson(bool value) const {
    return value ? L"true" : L"false";
  }

  std::wstring DoubleJson(double value) const {
    wchar_t buffer[64] = {};
    swprintf_s(buffer, L"%.2f", value);
    return buffer;
  }

  std::wstring BuildConfigJson() {
    lumesync::EnsureClientId(config_);
    std::wstring json = L"{";
    json += L"\"teacherIp\":\"" + lumesync::JsonEscape(config_.teacherIp) + L"\",";
    json += L"\"port\":" + std::to_wstring(config_.port) + L",";
    json += L"\"clientId\":\"" + lumesync::JsonEscape(config_.clientId) + L"\",";
    json += L"\"sessionToken\":\"" + lumesync::JsonEscape(config_.sessionToken) + L"\",";
    json += L"\"sessionExpiresAt\":\"" + lumesync::JsonEscape(config_.sessionExpiresAt) + L"\",";
    json += L"\"sessionServerTime\":\"" + lumesync::JsonEscape(config_.sessionServerTime) + L"\"";
    json += L"}";
    return json;
  }

  std::wstring BuildSettingsJson() const {
    std::wstring json = L"{";
    json += L"\"forceFullscreen\":" + BoolJson(settings_.forceFullscreen) + L",";
    json += L"\"syncFollow\":" + BoolJson(settings_.syncFollow) + L",";
    json += L"\"allowInteract\":" + BoolJson(settings_.allowInteract) + L",";
    json += L"\"syncInteraction\":" + BoolJson(settings_.syncInteraction) + L",";
    json += L"\"podiumAtTop\":" + BoolJson(settings_.podiumAtTop) + L",";
    json += L"\"renderScale\":" + DoubleJson(settings_.renderScale) + L",";
    json += L"\"uiScale\":" + DoubleJson(settings_.uiScale) + L",";
    json += L"\"alertJoin\":" + BoolJson(settings_.alertJoin) + L",";
    json += L"\"alertLeave\":" + BoolJson(settings_.alertLeave) + L",";
    json += L"\"alertFullscreenExit\":" + BoolJson(settings_.alertFullscreenExit) + L",";
    json += L"\"alertTabHidden\":" + BoolJson(settings_.alertTabHidden);
    json += L"}";
    return json;
  }

  void SendRpcResult(const std::wstring& id, bool ok, const std::wstring& payloadJson, const std::wstring& error = L"") {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_ || id.empty()) return;
    std::wstring response = L"{\"kind\":\"rpc-result\",\"id\":\"" + lumesync::JsonEscape(id) +
                            L"\",\"ok\":" + BoolJson(ok) + L",\"payload\":" + payloadJson;
    if (!error.empty()) response += L",\"error\":\"" + lumesync::JsonEscape(error) + L"\"";
    response += L"}";
    webview_->PostWebMessageAsJson(response.c_str());
#endif
  }

  void NotifyWindowState() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_) return;
    webview_->PostWebMessageAsJson(IsZoomed(hwnd_) ? L"{\"kind\":\"window-maximized\"}" : L"{\"kind\":\"window-unmaximized\"}");
#endif
  }

  void OpenDevTools() {
#if LUMESYNC_HAS_WEBVIEW2
    if (!webview_) return;
    webview_->OpenDevToolsWindow();
#endif
  }

  HINSTANCE instance_ = nullptr;
  HWND hwnd_ = nullptr;
  TeacherConfig config_;
  TeacherWindowSettings settings_;
  ChildProcess serverProcess_;
  SessionSecrets sessionSecrets_;
  StartupWindowOptions startupOptions_;
#if LUMESYNC_HAS_WEBVIEW2
  HMODULE webviewLoader_ = nullptr;
  ComPtr<ICoreWebView2Controller> webviewController_;
  ComPtr<ICoreWebView2> webview_;
#endif
};

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int nCmdShow) {
  EnableDpiAwareness();
  lumesync::AppendLog(L"shell", L"teacher shell starting");
  const StartupWindowOptions startupOptions = ParseStartupWindowOptions();
  HANDLE mutex = nullptr;
  if (!startupOptions.childWindow) {
    mutex = AcquireInstanceMutex();
    if (!mutex) {
      lumesync::AppendLog(L"shell", L"instance mutex already exists");
      ActivateExistingInstance();
      return 0;
    }
  }

  HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(hr)) {
    lumesync::AppendLog(L"shell", L"CoInitializeEx failed");
    if (mutex) CloseHandle(mutex);
    return 1;
  }

  TeacherShellApp app(instance, startupOptions);
  if (!app.Initialize(nCmdShow)) {
    lumesync::AppendLog(L"shell", L"TeacherShellApp::Initialize failed");
    CoUninitialize();
    if (mutex) CloseHandle(mutex);
    return 1;
  }
  lumesync::AppendLog(L"shell", L"teacher shell initialized");
  const int code = app.Run();
  lumesync::AppendLog(L"shell", L"teacher shell exiting with code " + std::to_wstring(code));
  CoUninitialize();
  if (mutex) CloseHandle(mutex);
  return code;
}
