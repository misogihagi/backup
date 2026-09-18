export const BLURAY_BACKUP_GUIDE_TEXT = `# Blu-ray 3-2-1 長期保存・コールドストレージ バックアップ仕様ガイド

## 1. Blu-rayバックアップのメリットと特性
- **長期保存性**: BD-R (特に M-DISC) は無機系記録膜を使用しており、適切な保管環境 (10~25℃, 40~60%湿度) で数十年〜100年以上の保存が可能。
- **物理的独立性 (エアギャップ)**: 電源やネットワークから遮断されているため、ランサムウェアやサイバー攻撃で暗号化される危険がゼロ。
- **低コスト**: BD-R XL (100GB/128GB) など大容量メディアを活用することで、テラバイト級のアーカイブを安価に構築可能。

---

## 2. 推奨書き込みワークフロー (標準手順)

### Step 1: データの整理・圧縮・パリティ付与
1. 7-Zip を使用して最高圧縮率 (\`-mx9\`) および 5% リカバリ領域 (\`-mrr5%\`) を付与。
2. UDF / FAT32 互換性のため 4095MB 上限で分割 (\`-v4095m\`)。
\`\`\`bash
7z a -mx9 -mrr5% archive.7z /path/to/target_folder -v4095m
\`\`\`

### Step 2: SHA-256 チェックサムの作成
書き込み前のハッシュリストを作成:
\`\`\`bash
shasum -a 256 archive.7z.part* > archive.hashlist
\`\`\`

### Step 3: ISO イメージの作成
\`\`\`bash
mkisofs -V "backup" -J -r -o backup.iso archive.7z.* archive.hashlist
\`\`\`

### Step 4: Blu-rayドライブでの書き込みとファイナライズ
\`\`\`bash
growisofs -dvd-compat -Z /dev/sr0=backup.iso
\`\`\`

### Step 5: 書き込み後ベリファイ検証
書き込まれたメディアをマウントし、ハッシュチェックを実施:
\`\`\`bash
mount /dev/sr0 /mnt/bluray
cd /mnt/bluray
shasum -a 256 -c archive.hashlist
\`\`\`

---

## 3. 保管ルール
- **専用ジュエルケース保管**: 不織布ケースは傷の原因となるため、プラスチックジュエルケースに1枚ずつ立てて直立保管。
- **冷暗所保管**: 直射日光を避け、室温 10〜25℃、湿度 40〜60% を維持。
- **定期ベリファイ**: 年1回程度、PCでハッシュチェックを行いサイレントディケイの有無を確認。
`;
