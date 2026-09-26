#!/usr/bin/env bash
set -eu

readonly MAX_TARGET_BYTES=24700000000
readonly BLOCKS_TO_CREATE=1000
readonly MIN_BLOCK_SIZE=2048

valid_args=()
total_kb=0

# 引数の存在確認と有効なパスの収集
for arg in "$@"; do
    if [ -e "$arg" ]; then
        valid_args+=("$arg")
    else
        echo "Warning: '$arg' は存在しないか、アクセスできません。" >&2
    fi
done

if [ ${#valid_args[@]} -eq 0 ]; then
    echo "Error: 有効なファイルまたはディレクトリが指定されていません。" >&2
    exit 1
fi

# 合計サイズ（バイト）の取得
total_kb=$(du -sk "${valid_args[@]}" 2>/dev/null | awk '{sum += $1} END {print sum+0}')
total_bytes=$((total_kb * 1024))

# 残り容量からパリティ1000個分のブロックサイズを逆算
remaining_bytes=$(( MAX_TARGET_BYTES - total_bytes ))
if [ "$remaining_bytes" -le 0 ]; then
    echo "Error: 元のファイルサイズ（$total_bytes bytes）がすでに目標上限（$MAX_TARGET_BYTES bytes）を超えています！" >&2
    exit 1
fi

raw_block_size=$(( remaining_bytes / BLOCKS_TO_CREATE ))

# 安全のため、2048の倍数に切り捨て
block_size=$(( (raw_block_size / 2048) * 2048 ))

if [ "$block_size" -lt "$MIN_BLOCK_SIZE" ]; then
    echo "Error: 容量の余裕が小さすぎて、指定のパリティブロック数（$BLOCKS_TO_CREATE）を確保できません。" >&2
    exit 1
fi

current_blocks=$(( (total_bytes + block_size - 1) / block_size ))
target_bytes=$(( BLOCKS_TO_CREATE * block_size ))
total_expected_bytes=$(( (current_blocks + BLOCKS_TO_CREATE) * block_size ))

# 実行結果の確認表示
echo "対象引数: $*"
echo "元データサイズ: $total_bytes bytes"
echo "ブロックサイズ: $block_size bytes"
echo "入力ブロック数: $current_blocks / 作成パリティブロック数: $BLOCKS_TO_CREATE (固定)"
echo "合計予定サイズ: $total_expected_bytes bytes (上限: $MAX_TARGET_BYTES bytes)"

# par2create の実行
par2create -s"$block_size" -c"$BLOCKS_TO_CREATE" archive.par "${valid_args[@]}"
