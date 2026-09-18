import type {
  DataType,
  DataImportance,
  UpdateFrequency,
  BudgetTier,
  BackupStrategyProposal,
} from '../types.js';
import { calculateBackupMedia } from './capacityCalc.js';

export interface StrategyInput {
  dataType: DataType;
  dataSizeBytes: number;
  importance: DataImportance;
  updateFrequency: UpdateFrequency;
  budget: BudgetTier;
  requireOffsite?: boolean;
  requireRansomwareProtection?: boolean;
}

export function proposeBackupStrategy(input: StrategyInput): BackupStrategyProposal {
  const {
    dataType,
    dataSizeBytes,
    importance,
    updateFrequency,
    budget,
    requireOffsite = true,
    requireRansomwareProtection = true,
  } = input;

  const mediaCalc = calculateBackupMedia(dataSizeBytes);

  const tiers: BackupStrategyProposal['tiers'] = [];

  // Tier 1: Hot / Immediate Copy (Local)
  tiers.push({
    tierNumber: 1,
    name: 'ローカル即時バックアップ (Primary Hot Backup)',
    mediaType: '外付けSSD / 外付けHDD / ローカルNAS',
    role: 'Hot (Immediate)',
    description: '日常のデータ保護および迅速なファイル復元 (RTO数分〜数時間) のための第1コピー。',
    recommendedTools:
      updateFrequency === 'daily'
        ? ['Restic', 'BorgBackup', 'Time Machine (macOS)', 'File History (Windows)']
        : ['Rsync', 'FreeFileSync'],
    updateFrequency: updateFrequency === 'daily' ? '毎日自動 (スナップショット)' : '週1回手動/自動同期',
    airGapped: false,
  });

  // Tier 2: Warm / Cloud / Remote Copy (Offsite)
  if (requireOffsite) {
    let cloudTarget = 'Backblaze B2 / AWS S3 Glacier';
    let tools = ['Rclone', 'Restic (Encrypted)'];

    if (budget === 'minimal') {
      cloudTarget = 'Google Drive / OneDrive / iCloud';
      tools = ['Rclone (rclone crypt)', 'Duplicati'];
    }

    tiers.push({
      tierNumber: 2,
      name: 'オフサイト・クラウド自動バックアップ (Secondary Offsite Backup)',
      mediaType: cloudTarget,
      role: 'Warm (Periodic)',
      description: '火災・盗難・広域災害に備える暗号化クラウドオフサイトコピー。',
      recommendedTools: tools,
      updateFrequency: updateFrequency === 'daily' ? '夜間自動バッチ' : '毎週またはデータ更新時',
      airGapped: false,
    });
  }

  // Tier 3: Cold / Optical / Air-gapped Archive (Long-term)
  if (
    importance === 'high' ||
    importance === 'critical' ||
    requireRansomwareProtection ||
    dataType === 'photos_videos' ||
    updateFrequency === 'rarely_static'
  ) {
    const discInfo = `${mediaCalc.recommendedDiscType} (${mediaCalc.recommendedDiscCount}枚)`;
    tiers.push({
      tierNumber: 3,
      name: 'Blu-ray / M-DISC 完全物理隔離アーカイブ (Immutable Cold Storage)',
      mediaType: `光学メディア ${discInfo} (M-DISC推奨)`,
      role: 'Cold (Long-term Archive)',
      description:
        'ネットワークおよび電源から完全に遮断（エアギャップ）された追記不能(BD-R)コールドストレージ。ランサムウェア感染・サイバー攻撃・電磁パルスから数十年単位でデータを保護。',
      recommendedTools: ['7-Zip (4GB分割・ベリファイ)', 'mkisofs', 'growisofs', 'shasum (ハッシュ計算)'],
      updateFrequency: '月1回 〜 年1回 (または重要プロジェクト・撮影完了時)',
      airGapped: true,
    });
  }

  // Determine overall strategy name
  let overallStrategyName = '標準 3-2-1 ハイブリッドバックアップ戦略';
  if (tiers.length === 3) {
    overallStrategyName = '堅牢 3-2-1-1-0 鉄壁バックアップ戦略 (ローカル + クラウド + Blu-rayエアギャップ)';
  } else if (importance === 'critical') {
    overallStrategyName = 'エンタープライズ級 ミッションクリティカルデータ保護戦略';
  }

  // Summary message construction
  const summary = `対象データ (${dataType}, ${(dataSizeBytes / (1024 * 1024 * 1024)).toFixed(
    1
  )} GB) に対し、3-2-1ルールの基準を満たす合計${tiers.length}層のバックアップ構成を提案します。特に${
    tiers.some((t) => t.airGapped) ? 'Blu-ray/M-DISCによるエアギャップ物理保管を取り入れることで、ランサムウェア被害からの100%復旧を保証します。' : 'ローカルとクラウドの多重化で可用性を確保します。'
  }`;

  // Rule 3-2-1 compliance check
  const copyCount = tiers.length + 1; // Primary source + tier copies
  const mediaTypesCount = new Set(tiers.map((t) => t.mediaType)).size + 1;
  const offsiteStorage = tiers.some((t) => t.role === 'Warm (Periodic)' || t.airGapped);
  const isCompliant = copyCount >= 3 && mediaTypesCount >= 2 && offsiteStorage;

  // Cost estimates
  let estimatedTotalCost = '初期費用: 約1万円 (外付けHDD) / 月額: 数十円〜数百円';
  if (tiers.some((t) => t.airGapped)) {
    estimatedTotalCost = `初期費用: ドライブ+M-DISCメディア代 約1.5万〜3万円 / 月額クラウド: \$${mediaCalc.cloudStorageEstimate.s3GlacierDeepArchiveMonthlyUSD}〜\$${mediaCalc.cloudStorageEstimate.backblazeB2MonthlyUSD}`;
  }

  const keyMaintenanceTasks = [
    '年1回のBlu-rayメディア読み出し検証 (shasum ハッシュチェック)',
    '半年に1回のリストアテスト (一部ファイルを実際に復元できるか試行)',
    '暗号化パスフレーズの紙媒体 (金庫) 保管',
    '3-5年ごとのプライマリ外付けHDDの予防的交換',
  ];

  return {
    summary,
    overallStrategyName,
    tiers,
    ruleCompliance321: {
      copyCount,
      mediaTypesCount,
      offsiteStorage,
      isCompliant,
    },
    estimatedTotalCost,
    keyMaintenanceTasks,
  };
}
