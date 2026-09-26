#!/usr/bin/env bash
set -eu

readonly TARGET_TOTAL_BLOCKS=12219392
readonly BLOCK_SIZE=2048

valid_args=()
total_kb=0

for arg in "$@"; do
    if [ -e "$arg" ]; then
        valid_args+=("$arg")
    else
        echo "Warning: '$arg' は存在しないか、アクセスできません。" >&2
    fi
done

# 有効な引数が一つもない場合は終了
if [ ${#valid_args[@]} -eq 0 ]; then
    echo "Error: 有効なファイルまたはディレクトリが指定されていません。" >&2
    exit 1
fi

# まとめて du を実行して合計サイズ（KB）を取得
total_kb=$(du -sk "${valid_args[@]}" 2>/dev/null | awk '{sum += $1} END {print sum+0}')
total_bytes=$((total_kb * 1024))

# ブロック数とターゲットバイト数の計算
current_blocks=$(( (total_bytes + 2047) / 2048 ))
blocks_to_create=$(( TARGET_TOTAL_BLOCKS - current_blocks ))
target_bytes=$(( blocks_to_create * BLOCK_SIZE ))

# 実行結果の表示
echo "対象引数: $*"
echo "合計サイズ: $total_bytes bytes ($current_blocks ブロック)"
echo "作成するパリティ純データ量: $target_bytes bytes ($blocks_to_create ブロック)"

# par2create の実行
par2 create -s"$BLOCK_SIZE" -c"$blocks_to_create" archive.par "${valid_args[@]}"

