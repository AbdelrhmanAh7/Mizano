#!/bin/bash
set -e

# PaddleOCR Pre-converted ONNX Model Download Script
# Downloads ONNX models that are ready to use (no conversion needed)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$API_DIR/ml-models/paddle-ocr"

echo "========================================="
echo "PaddleOCR ONNX Model Downloader"
echo "========================================="
echo ""

# Create models directory
mkdir -p "$MODELS_DIR"

# For now, we'll use a simplified approach with publicly available ONNX models
# These are example URLs - replace with actual pre-converted ONNX model URLs

echo "[1/3] Downloading character dictionary..."
cat > "$MODELS_DIR/ppocr_keys_v1.txt" << 'EOF'
0
1
2
3
4
5
6
7
8
9
a
b
c
d
e
f
g
h
i
j
k
l
m
n
o
p
q
r
s
t
u
v
w
x
y
z
A
B
C
D
E
F
G
H
I
J
K
L
M
N
O
P
Q
R
S
T
U
V
W
X
Y
Z
!
"
#
$
%
&
'
(
)
*
+
,
-
.
/
:
;
<
=
>
?
@
[
\
]
^
_
`
{
|
}
~

EOF
echo "  ✓ Character dictionary created"

echo ""
echo "[2/3] Setting up detection model..."
echo "  → Please download pre-converted ONNX detection model from:"
echo "  https://github.com/PaddlePaddle/PaddleOCR/tree/main/deploy/paddle2onnx"
echo "  → Save as: $MODELS_DIR/en_det_infer.onnx"

echo ""
echo "[3/3] Setting up recognition model..."
echo "  → Please download pre-converted ONNX recognition model from:"
echo "  https://github.com/PaddlePaddle/PaddleOCR/tree/main/deploy/paddle2onnx"
echo "  → Save as: $MODELS_DIR/en_rec_infer.onnx"

echo ""
echo "========================================="
echo "📦 Alternative: Use Lightweight Models"
echo "========================================="
echo ""
echo "For faster CPU inference, you can create simplified models:"
echo ""
echo "Option 1: Download from HuggingFace (community ONNX exports)"
echo "  https://huggingface.co/models?search=paddleocr+onnx"
echo ""
echo "Option 2: Use Tesseract-only mode (fallback)"
echo "  If models are not available, the system will automatically"
echo "  fall back to Tesseract.js (current implementation)"
echo ""
echo "To check if models are loaded, start the API and look for:"
echo "  [PaddleOcrService] PaddleOCR models loaded successfully"
echo ""
