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

DEVICE="/dev/sr0"
need_blocks=$(( (total_bytes + 2047) / 2048 ))

# メディアの空きブロック数を取得 (growisofsのドライランまたはdvd+rw-mediainfo等を利用)
# ここではdvd+rw-mediainfoから空き容量を取得します
media_info=$(dvd+rw-mediainfo "$DEVICE" 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "Error: デバイス '$DEVICE' からメディア情報を取得できませんでした。ディスクが入っているか確認してください。"
  exit 1
fi

# 記録可能ブロック数の取得 (Free Blocksなど)
# 簡易的に growisofs のエミュレーション機能(-M /dev/sr0=/dev/null などは使えないため、dvd+rw-mediainfoのFree blocksを使用)
free_blocks=$(echo "$media_info" | grep -i "Free Blocks" | awk '{print $3}')

if [ -z "$FREE_BLOCKS" ]; then
  # ドライブやメディアによって表示が違う場合のフォールバック（追記型か、新品BD-R/REかなど）
  # 25GBのBDの場合の概算値(約12219392ブロック等)をスニペットにするか、エラーとする
  echo "Warning: 正確な空きブロック数が取得できなかったため、メディアの最大容量から判定します。"
  # 25GB層の場合: 約 12219392 ブロック、50GB層(DL)の場合: 約 24438784 ブロックなど
  free_blocks=$(echo "$media_info" | grep -i "Capacity:" | tail -n 1 | awk '{print $3}' | tr -d '()')
  if [ -z "$free_blocks" ]; then
     echo "Error: メディアの容量を特定できませんでした。"
     exit 1
  fi
fi

# 比較と判定
echo "----------------------------------------"
echo " 書き込み予定: ${need_blocks} ブロック"
echo " メディア空き: ${free_blocks} ブロック"
echo "----------------------------------------"

if [ "$need_blocks" -gt "$free_blocks" ]; then
  over_blocks=$((need_blocks - free_blocks))
  over_mb=$((over_blocks * 2048 / 1024 / 1024))
  echo "【エラー】容量が ${over_mb} MB (${over_blocks} ブロック) オーバーしています！"
  exit 1
else
  safe_blocks=$((free_blocks - need_blocks))
  echo "【OK】メディアに収まります。（残り余裕: 約 $((safe_blocks * 2048 / 1024 / 1024)) MB）"
  exit 0
fi
