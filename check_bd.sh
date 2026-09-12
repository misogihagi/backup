#!/bin/bash

# 引数がない場合は使い方を表示して終了
if [ $# -eq 0 ]; then
    echo "Usage: $0 <file_or_directory...>"
    echo "Example: $0 archive/*"
    exit 1
fi

# 合計サイズ（KB）を計算
total_kb=0
for arg in "$@"; do
    if [ -e "$arg" ]; then
        # du -sk を使って指定パスの合計サイズ（KB）を取得
        size=$(du -sk "$arg" 2>/dev/null | awk '{print $1}')
        total_kb=$((total_kb + size))
    else
        echo "Warning: '$arg' は存在しないか、アクセスできません。"
    fi
done

# バイトおよびGBに換算
total_bytes=$((total_kb * 1024))
total_gb=$(awk "BEGIN {print $total_bytes / 1024 / 1024 / 1024}")
total_gb_formatted=$(printf "%.2f" "$total_gb")

echo "========================================"
echo " 対象ファイルの合計サイズ: ${total_gb_formatted} GB"
echo " (${total_bytes} bytes)"
echo "========================================"
echo "【BDディスク容量判定】"

# BDの規格容量（十進ベースの一般的な容量を基準に設定）
# ※ 実際の書き込み時はファイルシステム等で若干容量が減るため、余裕を持たせた判定にしています
bd_sl=$((25 * 1000 * 1000 * 1000))   # BD-R SL (片面1層): 25 GB
bd_dl=$((50 * 1000 * 1000 * 1000))   # BD-R DL (片面2層): 50 GB
bd_tl=$((100 * 1000 * 1000 * 1000))  # BD-R TL (BDXL 3層): 100 GB
bd_ql=$((128 * 1000 * 1000 * 1000))  # BD-R QL (BDXL 4層): 128 GB

if [ "$total_bytes" -le "$bd_sl" ]; then
    echo " [〇] BD-R (25GB / 片面1層) に入ります。"
elif [ "$total_bytes" -le "$bd_dl" ]; then
    echo " [〇] BD-R DL (50GB / 片面2層) に入ります。"
elif [ "$total_bytes" -le "$bd_tl" ]; then
    echo " [〇] BD-R TL (100GB / BDXL 3層) に入ります。"
elif [ "$total_bytes" -le "$bd_ql" ]; then
    echo " [〇] BD-R QL (128GB / BDXL 4層) に入ります。"
else
    echo " [×] 容量オーバーです！どのBD規格にも収まりません。"
fi
echo "========================================"
