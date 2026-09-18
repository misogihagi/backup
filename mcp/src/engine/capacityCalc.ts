import type { MediaCalculationResult } from '../types.js';

// Usable bytes per Blu-ray disc format (accounting for OS GiB conversion & UDF overhead)
const BLURAY_USABLE_BYTES = {
  bdr25: 25_000_000_000 * 0.93,   // ~23.25 GB usable
  bdr50: 50_000_000_000 * 0.93,   // ~46.50 GB usable
  bdr100: 100_000_000_000 * 0.93, // ~93.00 GB usable
  bdr128: 128_000_000_000 * 0.93, // ~119.00 GB usable
};

const CHUNK_SIZE_BYTES = 4095 * 1024 * 1024; // 4,294,443,008 bytes (4095MB)

export function calculateBackupMedia(
  dataSizeBytes: number,
  estimatedCompressibilityRatio = 0.8,
  includeParity = true
): MediaCalculationResult {
  const compressedSizeBytes = Math.round(dataSizeBytes * estimatedCompressibilityRatio);
  
  // Adding 5% parity recovery record (-mrr5%)
  const parityMultiplier = includeParity ? 1.05 : 1.0;
  const withParitySizeBytes = Math.round(compressedSizeBytes * parityMultiplier);

  // Split into 4095MB chunks
  const totalChunks = Math.ceil(withParitySizeBytes / CHUNK_SIZE_BYTES) || 1;

  // Calculate disc requirements
  const bdr25Discs = Math.ceil(withParitySizeBytes / BLURAY_USABLE_BYTES.bdr25) || 1;
  const bdr50Discs = Math.ceil(withParitySizeBytes / BLURAY_USABLE_BYTES.bdr50) || 1;
  const bdr100Discs = Math.ceil(withParitySizeBytes / BLURAY_USABLE_BYTES.bdr100) || 1;
  const bdr128Discs = Math.ceil(withParitySizeBytes / BLURAY_USABLE_BYTES.bdr128) || 1;

  // Recommendation strategy for disc type selection
  let recommendedDiscType: MediaCalculationResult['recommendedDiscType'] = 'BD-R 25GB';
  let recommendedDiscCount = bdr25Discs;

  if (withParitySizeBytes > BLURAY_USABLE_BYTES.bdr100 * 3) {
    recommendedDiscType = 'BD-R QL 128GB';
    recommendedDiscCount = bdr128Discs;
  } else if (withParitySizeBytes > BLURAY_USABLE_BYTES.bdr50 * 2) {
    recommendedDiscType = 'BD-R TL 100GB';
    recommendedDiscCount = bdr100Discs;
  } else if (withParitySizeBytes > BLURAY_USABLE_BYTES.bdr25 * 2) {
    recommendedDiscType = 'BD-R DL 50GB';
    recommendedDiscCount = bdr50Discs;
  }

  // M-DISC recommendation: Highly recommended for irreplaceable data
  const mdiscRecommended = true;

  // External Storage Size (3x multiplier for 3-year version growth)
  const dataSizeGB = dataSizeBytes / (1024 * 1024 * 1024);
  const externalStorageNeededGB = Math.max(500, Math.ceil(dataSizeGB * 3));

  // Cloud pricing estimates (per month)
  // S3 Glacier Deep Archive: ~$0.00099 / GB / month
  // Backblaze B2: ~$0.006 / GB / month
  const s3GlacierDeepArchiveMonthlyUSD = Number((dataSizeGB * 0.00099).toFixed(2));
  const backblazeB2MonthlyUSD = Number((dataSizeGB * 0.006).toFixed(2));

  return {
    dataSizeBytes,
    compressedSizeBytes,
    withParitySizeBytes,
    chunkSizeBytes: CHUNK_SIZE_BYTES,
    totalChunks,
    blurayRequirements: {
      bdr25: { capacityGB: 25, usableGiB: 23.2, discsNeeded: bdr25Discs },
      bdr50: { capacityGB: 50, usableGiB: 46.5, discsNeeded: bdr50Discs },
      bdr100: { capacityGB: 100, usableGiB: 93.1, discsNeeded: bdr100Discs },
      bdr128: { capacityGB: 128, usableGiB: 119.2, discsNeeded: bdr128Discs },
    },
    recommendedDiscType,
    recommendedDiscCount,
    mdiscRecommended,
    externalStorageNeededGB,
    cloudStorageEstimate: {
      s3GlacierDeepArchiveMonthlyUSD,
      backblazeB2MonthlyUSD,
    },
  };
}
