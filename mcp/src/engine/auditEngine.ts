import type { ComplianceAuditInput, ComplianceAuditResult } from '../types.js';

export function auditBackupCompliance(input: ComplianceAuditInput): ComplianceAuditResult {
  const {
    currentBackupCopiesCount,
    mediaTypesUsed,
    hasOffsiteCopy,
    isAirGapped,
    hasVerificationSchedule,
    encryptionUsed,
  } = input;

  let score = 0;
  const findings: ComplianceAuditResult['findings'] = [];
  const actionPlan: string[] = [];

  // 1. Copy Count Check (3-2-1 Rule: at least 3 total copies)
  if (currentBackupCopiesCount >= 3) {
    score += 30;
    findings.push({
      category: 'コピー保持数 (3-2-1 Rule)',
      passed: true,
      issue: 'なし',
      recommendation: `合計 ${currentBackupCopiesCount} つのコピーが確保されています。`,
    });
  } else {
    const missing = 3 - currentBackupCopiesCount;
    score += currentBackupCopiesCount * 10;
    findings.push({
      category: 'コピー保持数 (3-2-1 Rule)',
      passed: false,
      issue: `コピーが ${currentBackupCopiesCount} つしかありません。データ損失リスクが高まります。`,
      recommendation: `少なくともあと ${missing} つの追加コピーを作成してください。`,
    });
    actionPlan.push(`外付けドライブまたはクラウドストレージを追加し、合計3コピーを保持する。`);
  }

  // 2. Media Diversity Check (at least 2 different media types)
  const uniqueMediaCount = new Set(mediaTypesUsed).size;
  if (uniqueMediaCount >= 2) {
    score += 20;
    findings.push({
      category: 'メディア多様性',
      passed: true,
      issue: 'なし',
      recommendation: `${uniqueMediaCount} 種類の異なるメディア (${mediaTypesUsed.join(', ')}) が活用されています。`,
    });
  } else {
    score += 5;
    findings.push({
      category: 'メディア多様性',
      passed: false,
      issue: `単一のメディア種別 (${mediaTypesUsed.join(', ') || '未定義'}) のみに依存しています。同種メディアの同時故障リスクがあります。`,
      recommendation: 'HDDだけでなくBlu-rayやクラウドストレージなど異なる物理媒体を組み合わせましょう。',
    });
    actionPlan.push('HDD以外の媒体（Blu-ray M-DISCやクラウドストレージ）をバックアップ先に採用する。');
  }

  // 3. Offsite Check
  if (hasOffsiteCopy) {
    score += 20;
    findings.push({
      category: 'オフサイト保管',
      passed: true,
      issue: 'なし',
      recommendation: '遠隔地・クラウドへの保管が実施されており、地域災害・火災に耐性があります。',
    });
  } else {
    findings.push({
      category: 'オフサイト保管',
      passed: false,
      issue: 'すべてのバックアップが同一の部屋・建物内に存在します。火災や盗難で全滅する危険があります。',
      recommendation: '暗号化クラウドバックアップまたは実家・オフィス等への物理分散保管を行ってください。',
    });
    actionPlan.push('Backblaze B2やS3 Glacier等のクラウドへの定期送信を設定する。');
  }

  // 4. Air-Gap / Ransomware Protection
  if (isAirGapped) {
    score += 15;
    findings.push({
      category: 'ランサムウェア・エアギャップ耐性',
      passed: true,
      issue: 'なし',
      recommendation: '電源・ネットワークから切断された保管領域 (Blu-ray等) があり、サイバー攻撃から完全に遮断されています。',
    });
  } else {
    findings.push({
      category: 'ランサムウェア・エアギャップ耐性',
      passed: false,
      issue: 'バックアップメディアが常にPCやネットワークに接続されています。ランサムウェア感染時に同時に暗号化される危険性があります。',
      recommendation: '書き込み後に取り外す追記不能Blu-ray (BD-R) や、書き込み限定クラウドバケット (Object Lock) を採用してください。',
    });
    actionPlan.push('Blu-ray (BD-R / M-DISC) によるオフラインコールドアーカイブを導入する。');
  }

  // 5. Verification Schedule
  if (hasVerificationSchedule) {
    score += 10;
    findings.push({
      category: 'データ復元検証・サイレントディケイ対策',
      passed: true,
      issue: 'なし',
      recommendation: '定期的な整合性チェックおよびリストアテストの習慣化が行われています。',
    });
  } else {
    findings.push({
      category: 'データ復元検証・サイレントディケイ対策',
      passed: false,
      issue: '定期検証が行われていないため、サイレントデータ破損 (Bitrot) や書き込みミスに気付けないおそれがあります。',
      recommendation: '年1回のハッシュ値検証 (shasum) およびリストア試行スケジュールを設定しましょう。',
    });
    actionPlan.push('年1回の手動データ検証リマインダーをカレンダーに登録する。');
  }

  // 6. Security & Encryption
  if (encryptionUsed) {
    score += 5;
    findings.push({
      category: 'データ暗号化',
      passed: true,
      issue: 'なし',
      recommendation: 'バックアップデータは暗号化されており、メディア紛失・盗難時の漏洩が防止されています。',
    });
  } else {
    findings.push({
      category: 'データ暗号化',
      passed: false,
      issue: 'データが平文で保存されています。メディアの盗難やクラウドからの漏洩リスクがあります。',
      recommendation: '7-ZipのAES-256暗号化やrclone cryptを使用してください。',
    });
    actionPlan.push('7-Zip作成時またはクラウド転送時にAES-256暗号化を有効化する。');
  }

  // Determine Grade & Risk Level
  let grade: ComplianceAuditResult['grade'] = 'F';
  let riskLevel: ComplianceAuditResult['riskLevel'] = 'Critical';

  if (score >= 90) {
    grade = 'S';
    riskLevel = 'Low';
  } else if (score >= 75) {
    grade = 'A';
    riskLevel = 'Low';
  } else if (score >= 60) {
    grade = 'B';
    riskLevel = 'Medium';
  } else if (score >= 45) {
    grade = 'C';
    riskLevel = 'High';
  } else if (score >= 30) {
    grade = 'D';
    riskLevel = 'High';
  }

  return {
    overallScore: score,
    grade,
    riskLevel,
    findings,
    actionPlan,
  };
}
