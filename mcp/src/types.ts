export type DataType = 
  | 'documents'
  | 'photos_videos'
  | 'source_code'
  | 'database'
  | 'system_image'
  | 'mixed_general';

export type DataImportance = 'low' | 'medium' | 'high' | 'critical';

export type UpdateFrequency = 'daily' | 'weekly' | 'monthly' | 'rarely_static';

export type TargetOS = 'linux' | 'macos' | 'windows';

export type BudgetTier = 'minimal' | 'moderate' | 'enterprise';

export interface TargetAnalysisResult {
  targetPath: string;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  totalFiles: number;
  totalDirectories: number;
  typeDistribution: Record<string, { count: number; bytes: number; percentage: number }>;
  primaryDataType: DataType;
  estimatedCompressibilityRatio: number; // e.g. 0.6 = 60% of original size after 7z
  estimatedCompressedSizeBytes: number;
  estimatedCompressedSizeFormatted: string;
}

export interface MediaCalculationResult {
  dataSizeBytes: number;
  compressedSizeBytes: number;
  withParitySizeBytes: number; // Including 5% recovery record
  chunkSizeBytes: number; // 4095MB = 4,294,443,008 bytes
  totalChunks: number;
  blurayRequirements: {
    bdr25: { capacityGB: 25; usableGiB: 23.2; discsNeeded: number };
    bdr50: { capacityGB: 50; usableGiB: 46.5; discsNeeded: number };
    bdr100: { capacityGB: 100; usableGiB: 93.1; discsNeeded: number };
    bdr128: { capacityGB: 128; usableGiB: 119.2; discsNeeded: number };
  };
  recommendedDiscType: 'BD-R 25GB' | 'BD-R DL 50GB' | 'BD-R TL 100GB' | 'BD-R QL 128GB';
  recommendedDiscCount: number;
  mdiscRecommended: boolean;
  externalStorageNeededGB: number;
  cloudStorageEstimate: {
    s3GlacierDeepArchiveMonthlyUSD: number;
    backblazeB2MonthlyUSD: number;
  };
}

export interface BackupStrategyProposal {
  summary: string;
  overallStrategyName: string;
  tiers: {
    tierNumber: number;
    name: string;
    mediaType: string;
    role: 'Hot (Immediate)' | 'Warm (Periodic)' | 'Cold (Long-term Archive)';
    description: string;
    recommendedTools: string[];
    updateFrequency: string;
    airGapped: boolean;
  }[];
  ruleCompliance321: {
    copyCount: number;
    mediaTypesCount: number;
    offsiteStorage: boolean;
    isCompliant: boolean;
  };
  estimatedTotalCost: string;
  keyMaintenanceTasks: string[];
}

export interface CommandGenInput {
  os: TargetOS;
  sourcePath: string;
  outputDir: string;
  archiveName?: string;
  discDevice?: string; // e.g. /dev/sr0 or E:
  includeCloud?: boolean;
}

export interface ComplianceAuditInput {
  currentBackupCopiesCount: number;
  mediaTypesUsed: string[]; // e.g. ["USB HDD", "Google Drive"]
  hasOffsiteCopy: boolean;
  isAirGapped: boolean; // e.g. disconnected from net & power
  hasVerificationSchedule: boolean;
  encryptionUsed: boolean;
  primaryDataTypes: DataType[];
}

export interface ComplianceAuditResult {
  overallScore: number; // 0 - 100
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  findings: {
    category: string;
    passed: boolean;
    issue: string;
    recommendation: string;
  }[];
  actionPlan: string[];
}
