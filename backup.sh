#!/usr/bin/env bash
set -eu

# 目標とする最大バイト数（24.7 GB）
readonly MAX_TARGET_BYTES=24700000000
readonly BLOCK_SIZE=2048
readonly MAX_BLOCKS=$(( MAX_TARGET_BYTES / BLOCK_SIZE ))

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

# 合計サイズ（KB）の取得
total_kb=$(du -sk "${valid_args[@]}" 2>/dev/null | awk '{sum += $1} END {print sum+0}')
total_bytes=$((total_kb * 1024))

current_blocks=$(( (total_bytes + BLOCK_SIZE - 1) / BLOCK_SIZE ))

# 24.7GB に収まるように作成するパリティブロック数を計算
blocks_to_create=$(( MAX_BLOCKS - current_blocks ))

if [ "$blocks_to_create" -lt 0 ]; then
    echo "Error: 元のファイルサイズ（$total_bytes bytes）がすでに目標上限（$MAX_TARGET_BYTES bytes）を超えています！" >&2
    exit 1
fi

target_bytes=$(( blocks_to_create * BLOCK_SIZE ))
total_expected_bytes=$(( (current_blocks + blocks_to_create) * BLOCK_SIZE ))

# 実行結果の確認表示
echo "対象引数: $*"
echo "元データサイズ: $total_bytes bytes ($current_blocks ブロック)"
echo "作成するパリティ: $target_bytes bytes ($blocks_to_create ブロック)"
echo "合計予定サイズ: $total_expected_bytes bytes (上限: $MAX_TARGET_BYTES bytes)"

# par2create の実行
par2 create -s"$BLOCK_SIZE" -c"$blocks_to_create" archive.par "${valid_args[@]}"


