import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DataType, TargetAnalysisResult } from '../types.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

const EXTENSION_CATEGORIES: Record<string, DataType> = {
  // Photos & Videos
  '.jpg': 'photos_videos',
  '.jpeg': 'photos_videos',
  '.png': 'photos_videos',
  '.gif': 'photos_videos',
  '.webp': 'photos_videos',
  '.raw': 'photos_videos',
  '.cr2': 'photos_videos',
  '.nef': 'photos_videos',
  '.arw': 'photos_videos',
  '.mp4': 'photos_videos',
  '.mkv': 'photos_videos',
  '.mov': 'photos_videos',
  '.avi': 'photos_videos',
  '.webm': 'photos_videos',

  // Documents
  '.pdf': 'documents',
  '.doc': 'documents',
  '.docx': 'documents',
  '.xls': 'documents',
  '.xlsx': 'documents',
  '.ppt': 'documents',
  '.pptx': 'documents',
  '.txt': 'documents',
  '.md': 'documents',
  '.csv': 'documents',

  // Source Code
  '.ts': 'source_code',
  '.tsx': 'source_code',
  '.js': 'source_code',
  '.jsx': 'source_code',
  '.py': 'source_code',
  '.c': 'source_code',
  '.cpp': 'source_code',
  '.h': 'source_code',
  '.rs': 'source_code',
  '.go': 'source_code',
  '.java': 'source_code',
  '.html': 'source_code',
  '.css': 'source_code',
  '.json': 'source_code',
  '.yaml': 'source_code',
  '.yml': 'source_code',

  // Database
  '.sqlite': 'database',
  '.db': 'database',
  '.sql': 'database',
  '.mdb': 'database',

  // System Image & Archives
  '.iso': 'system_image',
  '.vmdk': 'system_image',
  '.img': 'system_image',
  '.zip': 'mixed_general',
  '.7z': 'mixed_general',
  '.tar': 'mixed_general',
  '.gz': 'mixed_general',
};

// Estimated compressibility multiplier for 7-zip high compression (-mx9)
const COMPRESSIBILITY_BY_TYPE: Record<DataType, number> = {
  photos_videos: 0.95,  // Already compressed media (~95% size)
  documents: 0.35,      // Highly compressible text/office (~35% size)
  source_code: 0.25,    // Highly compressible text (~25% size)
  database: 0.30,       // Structured text/data (~30% size)
  system_image: 0.50,   // Moderate compression (~50% size)
  mixed_general: 0.80   // Default fallback (~80% size)
};

export async function analyzeTargetDirectory(targetPath: string, maxDepth = 10): Promise<TargetAnalysisResult> {
  const resolvedPath = path.resolve(targetPath);
  let totalSizeBytes = 0;
  let totalFiles = 0;
  let totalDirectories = 0;

  const categoryStats: Record<string, { count: number; bytes: number }> = {
    photos_videos: { count: 0, bytes: 0 },
    documents: { count: 0, bytes: 0 },
    source_code: { count: 0, bytes: 0 },
    database: { count: 0, bytes: 0 },
    system_image: { count: 0, bytes: 0 },
    mixed_general: { count: 0, bytes: 0 },
  };

  async function walk(currentPath: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        // Skip node_modules, .git, .cache for large tree performance
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.cache') {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          totalDirectories++;
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          totalFiles++;
          try {
            const stat = await fs.stat(fullPath);
            const size = stat.size;
            totalSizeBytes += size;

            const ext = path.extname(entry.name).toLowerCase();
            const cat = EXTENSION_CATEGORIES[ext] || 'mixed_general';
            categoryStats[cat].count++;
            categoryStats[cat].bytes += size;
          } catch {
            // Ignore stat errors for unreadable files
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  // Check if single file or directory
  try {
    const rootStat = await fs.stat(resolvedPath);
    if (rootStat.isFile()) {
      totalFiles = 1;
      totalSizeBytes = rootStat.size;
      const ext = path.extname(resolvedPath).toLowerCase();
      const cat = EXTENSION_CATEGORIES[ext] || 'mixed_general';
      categoryStats[cat].count = 1;
      categoryStats[cat].bytes = rootStat.size;
    } else if (rootStat.isDirectory()) {
      await walk(resolvedPath, 1);
    }
  } catch (err) {
    throw new Error(`Target path "${targetPath}" is not accessible: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Calculate percentages and determine primary type
  let primaryDataType: DataType = 'mixed_general';
  let maxCategoryBytes = -1;

  const typeDistribution: Record<string, { count: number; bytes: number; percentage: number }> = {};

  for (const [catKey, stat] of Object.entries(categoryStats)) {
    const percentage = totalSizeBytes > 0 ? Number(((stat.bytes / totalSizeBytes) * 100).toFixed(1)) : 0;
    typeDistribution[catKey] = {
      count: stat.count,
      bytes: stat.bytes,
      percentage,
    };

    if (stat.bytes > maxCategoryBytes) {
      maxCategoryBytes = stat.bytes;
      primaryDataType = catKey as DataType;
    }
  }

  // Weighted estimated compressibility ratio
  let weightedRatioSum = 0;
  if (totalSizeBytes > 0) {
    for (const [catKey, stat] of Object.entries(categoryStats)) {
      const catRatio = COMPRESSIBILITY_BY_TYPE[catKey as DataType] ?? 0.8;
      weightedRatioSum += (stat.bytes / totalSizeBytes) * catRatio;
    }
  } else {
    weightedRatioSum = 0.8;
  }

  const estimatedCompressibilityRatio = Number(weightedRatioSum.toFixed(2));
  const estimatedCompressedSizeBytes = Math.round(totalSizeBytes * estimatedCompressibilityRatio);

  return {
    targetPath: resolvedPath,
    totalSizeBytes,
    totalSizeFormatted: formatBytes(totalSizeBytes),
    totalFiles,
    totalDirectories,
    typeDistribution,
    primaryDataType,
    estimatedCompressibilityRatio,
    estimatedCompressedSizeBytes,
    estimatedCompressedSizeFormatted: formatBytes(estimatedCompressedSizeBytes),
  };
}
