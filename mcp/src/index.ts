import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { analyzeTargetDirectory } from './analyzers/targetAnalyzer.js';
import { calculateBackupMedia } from './engine/capacityCalc.js';
import { proposeBackupStrategy } from './engine/strategyEngine.ts';
import { generateBackupCommands } from './engine/commandGen.js';
import { auditBackupCompliance } from './engine/auditEngine.js';
import { BLURAY_BACKUP_GUIDE_TEXT } from './resources/blurayGuide.js';
import type { DataType, DataImportance, UpdateFrequency, BudgetTier, TargetOS } from './types.js';

// Initialize MCP Server instance
const server = new Server(
  {
    name: 'backup-advisor-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// -----------------------------------------------------------------------------
// 1. Resources Definition
// -----------------------------------------------------------------------------
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'backup://guide/3-2-1-bluray',
        name: 'Blu-ray 3-2-1 コールドストレージ保存仕様ガイド',
        description: 'Blu-ray (BD-R / M-DISC) を用いた3-2-1ルールの詳細な長期保存手順・暗号化・ハッシュ検証ガイド',
        mimeType: 'text/markdown',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === 'backup://guide/3-2-1-bluray') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: BLURAY_BACKUP_GUIDE_TEXT,
        },
      ],
    };
  }
  throw new Error(`Resource not found: ${uri}`);
});

// -----------------------------------------------------------------------------
// 2. Prompts Definition
// -----------------------------------------------------------------------------
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'backup_consultation',
        description: '対話形式でユーザーのデータ保護ニーズ、データ量、予算感を問いかけ最適なバックアップ構成を診断するプロンプト',
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;
  if (name === 'backup_consultation') {
    return {
      description: 'バックアップ戦略のヒアリングと提案を行うコンサルテーションプロンプト',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: '大切なデータを安全にバックアップしたいです。以下の質問に回答しますので、3-2-1ルールに基づいた最適なバックアップ計画、必要なメディア（Blu-ray枚数など）、および実行コマンドを提案してください：\n1. バックアップしたいデータの内容（例: デジカメ写真・動画、書類、ソースコード、DBなど）\n2. おおよそのデータ容量 (GB/TB)\n3. データの更新頻度（毎日、月1回、ほとんど変更しないアーカイブなど）\n4. ランサムウェア対策や長期保存 (10年以上) の必要性\n5. 使用しているOS (Linux / macOS / Windows)',
          },
        },
      ],
    };
  }
  throw new Error(`Prompt not found: ${name}`);
});

// -----------------------------------------------------------------------------
// 3. Tools Definition
// -----------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_backup_target',
        description: '指定したローカルディレクトリのファイル数、総容量、拡張子内訳、推定圧縮率をスキャン解析します。',
        inputSchema: {
          type: 'object',
          properties: {
            targetPath: {
              type: 'string',
              description: '解析対象のローカルディレクトリパス (例: /home/user/Pictures, C:\\Data)',
            },
            maxDepth: {
              type: 'number',
              description: 'ディレクトリ検索の最大深さ (デフォルト: 10)',
              default: 10,
            },
          },
          required: ['targetPath'],
        },
      },
      {
        name: 'propose_backup_strategy',
        description: 'データ種別・容量・重要度・更新頻度・予算に応じた3-2-1ルールの多層バックアップ構成 (ローカル/クラウド/Blu-rayエアギャップ) を提案します。',
        inputSchema: {
          type: 'object',
          properties: {
            dataType: {
              type: 'string',
              enum: ['documents', 'photos_videos', 'source_code', 'database', 'system_image', 'mixed_general'],
              description: 'バックアップ対象の主なデータタイプ',
            },
            dataSizeBytes: {
              type: 'number',
              description: 'データ総容量 (バイト単位)',
            },
            importance: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'データの重要度',
            },
            updateFrequency: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly', 'rarely_static'],
              description: 'データの更新頻度',
            },
            budget: {
              type: 'string',
              enum: ['minimal', 'moderate', 'enterprise'],
              description: '予算感',
            },
            requireOffsite: {
              type: 'boolean',
              description: 'オフサイト（遠隔地・クラウド）コピーの必要性 (デフォルト: true)',
              default: true,
            },
            requireRansomwareProtection: {
              type: 'boolean',
              description: 'ランサムウェア対策・エアギャップの必要性 (デフォルト: true)',
              default: true,
            },
          },
          required: ['dataType', 'dataSizeBytes', 'importance', 'updateFrequency', 'budget'],
        },
      },
      {
        name: 'calculate_backup_media',
        description: 'データサイズと圧縮率から、必要なBlu-rayディスク枚数 (25/50/100/128GB)、7z分割数 (-v4095m)、外付けHDD容量、クラウドコストを精密計算します。',
        inputSchema: {
          type: 'object',
          properties: {
            dataSizeBytes: {
              type: 'number',
              description: 'データのバイト数',
            },
            estimatedCompressibilityRatio: {
              type: 'number',
              description: '推定圧縮率 (例: 0.8 = 圧縮後80%)',
              default: 0.8,
            },
            includeParity: {
              type: 'boolean',
              description: '5%リカバリパリティ領域 (-mrr5%) を計算に含めるか (デフォルト: true)',
              default: true,
            },
          },
          required: ['dataSizeBytes'],
        },
      },
      {
        name: 'generate_backup_commands',
        description: '指定したOS (Linux/macOS/Windows) 用に、7z圧縮、ハッシュ計算、mkisofs, growisofs, rclone 等の実行可能なシェルスクリプトを生成します。',
        inputSchema: {
          type: 'object',
          properties: {
            os: {
              type: 'string',
              enum: ['linux', 'macos', 'windows'],
              description: '実行環境のOS',
            },
            sourcePath: {
              type: 'string',
              description: 'バックアップ元パス (例: /home/user/my_photos)',
            },
            outputDir: {
              type: 'string',
              description: 'アーカイブ出力先・一時保存先ディレクトリ (例: /tmp/backup_out)',
            },
            archiveName: {
              type: 'string',
              description: 'アーカイブの基本名 (デフォルト: backup)',
              default: 'backup',
            },
            discDevice: {
              type: 'string',
              description: 'Blu-rayドライブのデバイス名 (デフォルト: /dev/sr0)',
              default: '/dev/sr0',
            },
            includeCloud: {
              type: 'boolean',
              description: 'rclone 等のクラウド同期コマンドを含めるか (デフォルト: true)',
              default: true,
            },
          },
          required: ['os', 'sourcePath', 'outputDir'],
        },
      },
      {
        name: 'audit_backup_compliance',
        description: '現在のバックアップ運用が 3-2-1 ルール、ランサムウェア耐性、サイレントディケイ（ビットロット）対策に適合しているかスコア診断します。',
        inputSchema: {
          type: 'object',
          properties: {
            currentBackupCopiesCount: {
              type: 'number',
              description: '保持している合計コピー数 (原本含む)',
            },
            mediaTypesUsed: {
              type: 'array',
              items: { type: 'string' },
              description: '使用しているメディア種別一覧 (例: ["Local SSD", "Cloud B2", "Blu-ray"])',
            },
            hasOffsiteCopy: {
              type: 'boolean',
              description: '自宅・自社以外の遠隔地やクラウドにコピーがあるか',
            },
            isAirGapped: {
              type: 'boolean',
              description: 'ネット・電源から切断された物理的隔離コピー (BD-R等) があるか',
            },
            hasVerificationSchedule: {
              type: 'boolean',
              description: '定期的なデータ読み出し・ハッシュ検証を行っているか',
            },
            encryptionUsed: {
              type: 'boolean',
              description: 'データが暗号化されているか',
            },
            primaryDataTypes: {
              type: 'array',
              items: { type: 'string' },
              description: '主なデータ種別',
            },
          },
          required: [
            'currentBackupCopiesCount',
            'mediaTypesUsed',
            'hasOffsiteCopy',
            'isAirGapped',
            'hasVerificationSchedule',
            'encryptionUsed',
          ],
        },
      },
    ],
  };
});

// Tool Handlers Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'analyze_backup_target') {
      const { targetPath, maxDepth = 10 } = args as { targetPath: string; maxDepth?: number };
      const result = await analyzeTargetDirectory(targetPath, maxDepth);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === 'propose_backup_strategy') {
      const {
        dataType,
        dataSizeBytes,
        importance,
        updateFrequency,
        budget,
        requireOffsite = true,
        requireRansomwareProtection = true,
      } = args as {
        dataType: DataType;
        dataSizeBytes: number;
        importance: DataImportance;
        updateFrequency: UpdateFrequency;
        budget: BudgetTier;
        requireOffsite?: boolean;
        requireRansomwareProtection?: boolean;
      };

      const proposal = proposeBackupStrategy({
        dataType,
        dataSizeBytes,
        importance,
        updateFrequency,
        budget,
        requireOffsite,
        requireRansomwareProtection,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(proposal, null, 2),
          },
        ],
      };
    }

    if (name === 'calculate_backup_media') {
      const { dataSizeBytes, estimatedCompressibilityRatio = 0.8, includeParity = true } = args as {
        dataSizeBytes: number;
        estimatedCompressibilityRatio?: number;
        includeParity?: boolean;
      };

      const calculation = calculateBackupMedia(dataSizeBytes, estimatedCompressibilityRatio, includeParity);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(calculation, null, 2),
          },
        ],
      };
    }

    if (name === 'generate_backup_commands') {
      const {
        os,
        sourcePath,
        outputDir,
        archiveName = 'backup',
        discDevice = '/dev/sr0',
        includeCloud = true,
      } = args as {
        os: TargetOS;
        sourcePath: string;
        outputDir: string;
        archiveName?: string;
        discDevice?: string;
        includeCloud?: boolean;
      };

      const result = generateBackupCommands({
        os,
        sourcePath,
        outputDir,
        archiveName,
        discDevice,
        includeCloud,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === 'audit_backup_compliance') {
      const {
        currentBackupCopiesCount,
        mediaTypesUsed,
        hasOffsiteCopy,
        isAirGapped,
        hasVerificationSchedule,
        encryptionUsed,
        primaryDataTypes = [],
      } = args as {
        currentBackupCopiesCount: number;
        mediaTypesUsed: string[];
        hasOffsiteCopy: boolean;
        isAirGapped: boolean;
        hasVerificationSchedule: boolean;
        encryptionUsed: boolean;
        primaryDataTypes?: DataType[];
      };

      const audit = auditBackupCompliance({
        currentBackupCopiesCount,
        mediaTypesUsed,
        hasOffsiteCopy,
        isAirGapped,
        hasVerificationSchedule,
        encryptionUsed,
        primaryDataTypes,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(audit, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool "${name}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start StdioServerTransport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error starting backup-advisor-mcp server:', err);
  process.exit(1);
});
