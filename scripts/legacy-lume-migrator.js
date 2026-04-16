const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');

function isZipFile(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    } catch (_) {
        return false;
    }
}

function getCourseDataSource(source) {
    const text = String(source || '');
    const courseDataIndex = text.lastIndexOf('window.CourseData');
    return courseDataIndex >= 0 ? text.slice(courseDataIndex) : text;
}

function extractStringProperty(source, key) {
    const match = getCourseDataSource(source).match(new RegExp(`${key}:\\s*["'](.+?)["']`));
    return match ? match[1] : '';
}

function sanitizeId(input) {
    return String(input || 'course')
        .trim()
        .replace(/\.lume$/i, '')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'course';
}

async function writeArchive(outputPath, manifest, legacySource) {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
        archive.append(legacySource, { name: 'slides/LegacyCourse.tsx' });
        archive.finalize();
    });
}

async function migrateLegacyLume(inputPath, explicitOutput) {
    const resolvedInputPath = path.resolve(inputPath || '');
    const resolvedOutputPath = explicitOutput ? path.resolve(explicitOutput) : resolvedInputPath.replace(/\.lume$/i, '.migrated.lume');

    if (!resolvedInputPath) {
        throw new Error('Input path is required');
    }
    if (!fs.existsSync(resolvedInputPath) || !fs.statSync(resolvedInputPath).isFile()) {
        throw new Error(`Input file not found: ${resolvedInputPath}`);
    }
    if (path.extname(resolvedInputPath).toLowerCase() !== '.lume') {
        throw new Error('Input must be a .lume file');
    }
    if (isZipFile(resolvedInputPath)) {
        throw new Error('Input already appears to be a Zip .lume package');
    }
    if (path.resolve(resolvedOutputPath).toLowerCase() === resolvedInputPath.toLowerCase()) {
        throw new Error('Output path must be different from input path');
    }

    const source = await fs.promises.readFile(resolvedInputPath, 'utf8');
    const baseName = path.basename(resolvedInputPath, '.lume');
    const hash = crypto.createHash('sha1').update(source).digest('hex').slice(0, 10);
    const title = extractStringProperty(source, 'title') || baseName;
    const now = new Date().toISOString();

    const manifest = {
        schemaVersion: '1.0.0',
        id: `${sanitizeId(baseName)}-${hash}`,
        title,
        version: '1.0.0',
        author: { name: 'LumeSync' },
        createdAt: now,
        updatedAt: now,
        icon: extractStringProperty(source, 'icon') || 'Course',
        desc: extractStringProperty(source, 'desc') || '',
        color: extractStringProperty(source, 'color') || 'from-blue-500 to-indigo-600',
        runtime: {
            format: 'lumesync-zip',
            react: '18',
            slideModule: 'tsx',
            entryMode: 'legacy-course-data',
            preferredAspectRatio: '16:9'
        },
        pages: [
            {
                id: 'legacy-course',
                file: 'slides/LegacyCourse.tsx',
                title
            }
        ],
        assets: {}
    };

    await writeArchive(resolvedOutputPath, manifest, source);

    return {
        inputPath: resolvedInputPath,
        outputPath: resolvedOutputPath,
        title,
        manifestId: manifest.id
    };
}

function collectLegacyLumeFiles(inputPath) {
    const resolvedInputPath = path.resolve(inputPath || '');
    if (!resolvedInputPath) {
        throw new Error('Input path is required');
    }
    if (!fs.existsSync(resolvedInputPath)) {
        throw new Error(`Path not found: ${resolvedInputPath}`);
    }

    const stat = fs.statSync(resolvedInputPath);
    if (stat.isFile()) {
        if (path.extname(resolvedInputPath).toLowerCase() !== '.lume') {
            return [];
        }
        return isZipFile(resolvedInputPath) ? [] : [resolvedInputPath];
    }

    const results = [];
    const stack = [resolvedInputPath];
    while (stack.length > 0) {
        const currentDir = stack.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                stack.push(absolutePath);
                continue;
            }
            if (path.extname(entry.name).toLowerCase() !== '.lume') continue;
            if (isZipFile(absolutePath)) continue;
            results.push(absolutePath);
        }
    }

    return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

module.exports = {
    collectLegacyLumeFiles,
    extractStringProperty,
    getCourseDataSource,
    isZipFile,
    migrateLegacyLume,
    sanitizeId
};
