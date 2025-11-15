const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 640;
const FIELD_COLS = 8;
const FIELD_ROWS = 16;
const CELL_SIZE = 32;
const FRAME_POSITION = { x: 96, y: 28 };
const FIELD_ORIGIN = { x: 112, y: 84 };
const NORMAL_DROP_INTERVAL = 500;
const FAST_DROP_INTERVAL = 80;
const AUTO_FALL_SPEED_MULTIPLIER = 2;
const AUTO_FALL_INTERVAL = NORMAL_DROP_INTERVAL / AUTO_FALL_SPEED_MULTIPLIER;
const SAFE_ROWS = 3;
const PREVIEW_CELL_SIZE = 28;
const PREVIEW_SPACING = PREVIEW_CELL_SIZE + 4;
const PREVIEW_ORIGIN = {
    x: FRAME_POSITION.x + 320,
    y: FRAME_POSITION.y + 24
};
const SPAWN_ORIENTATIONS = ["right", "down"];
const HAPTIC_TAP_DURATION = 35;
const HAPTIC_CLEAR_PATTERN = [25, 40, 25];

const COLOR_CODES = { red: 1, blue: 2, yellow: 3 };
const COLOR_NAMES = Object.keys(COLOR_CODES);
const ORIENTATIONS = ["up", "right", "down", "left"];
const ORIENTATION_OFFSETS = {
    up: { row: -1, col: 0 },
    right: { row: 0, col: 1 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 }
};

const assetSources = {
    bg: "bg_main.png",
    bottle: "bottle_frame.png",
    cell: "cell_bg.png",
    doctor: "doctor_cat.png",
    virus_red: "virus_nyan_red.png",
    virus_blue: "virus_nyan_blue.png",
    virus_yellow: "virus_nyan_yellow.png",
    capsule_red_top: "capsule_red_top.png",
    capsule_red_bottom: "capsule_red_bottom.png",
    capsule_red_left: "capsule_red_left.png",
    capsule_red_right: "capsule_red_right.png",
    capsule_blue_top: "capsule_blue_top.png",
    capsule_blue_bottom: "capsule_blue_bottom.png",
    capsule_blue_left: "capsule_blue_left.png",
    capsule_blue_right: "capsule_blue_right.png",
    capsule_yellow_top: "capsule_yellow_top.png",
    capsule_yellow_bottom: "capsule_yellow_bottom.png",
    capsule_yellow_left: "capsule_yellow_left.png",
    capsule_yellow_right: "capsule_yellow_right.png"
};

const levelOverlay = document.getElementById("levelOverlay");
const levelSlider = document.getElementById("levelSlider");
const levelValue = document.getElementById("levelValue");
const startLevelButton = document.getElementById("btnStartLevel");
const levelToggleButton = document.getElementById("btnLevel");

const images = {};
let board = createEmptyBoard();
let activeCapsule = null;
let lastDropTime = 0;
let fastDrop = false;
let gameOver = false;
let score = 0;
let assetsReady = false;
let pendingMatches = false;
let fallingPieces = [];
let lastFrameTime = 0;
let currentLevel = 0;
let remainingViruses = 0;
let isGameRunning = false;
let capsuleIdBoard = createEmptyBoard();
let capsulePairCounts = new Map();
let nextCapsuleId = 1;
let gravityPending = false;
let capsuleVariantBoard = createVariantBoard();
let levelCleared = false;
let pendingLevelClear = false;
let nextCapsuleData = null;
let vibrationEnabled = true;
const supportsVibration =
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
const MIN_LEVEL = 0;
const MAX_LEVEL = 20;

setupInputHandlers();
setupLevelControls();
loadAssets()
    .then(() => {
        assetsReady = true;
        showLevelOverlay();
        requestAnimationFrame(gameLoop);
    })
    .catch((error) => {
        console.error("Asset loading failed", error);
    });

function createEmptyBoard() {
    return Array.from({ length: FIELD_ROWS }, () => Array(FIELD_COLS).fill(0));
}

function createVariantBoard() {
    return Array.from({ length: FIELD_ROWS }, () => Array(FIELD_COLS).fill(null));
}

function createRandomCapsuleData() {
    const colorA = COLOR_NAMES[getRandomInt(0, COLOR_NAMES.length - 1)];
    const colorB = COLOR_NAMES[getRandomInt(0, COLOR_NAMES.length - 1)];
    const orientation =
        SPAWN_ORIENTATIONS[getRandomInt(0, SPAWN_ORIENTATIONS.length - 1)];
    return { colors: [colorA, colorB], orientation };
}

function initGame() {
    board = createEmptyBoard();
    capsuleIdBoard = createEmptyBoard();
    capsuleVariantBoard = createVariantBoard();
    capsulePairCounts = new Map();
    nextCapsuleId = 1;
    score = 0;
    fastDrop = false;
    gameOver = false;
    pendingMatches = false;
    fallingPieces = [];
    lastFrameTime = 0;
    gravityPending = false;
    levelCleared = false;
    pendingLevelClear = false;
    nextCapsuleData = createRandomCapsuleData();
    placeVirusesForLevel(currentLevel);
    remainingViruses = countViruses();
    spawnCapsule();
    lastDropTime = performance.now();
}

function setupInputHandlers() {
    const leftButton = document.getElementById("btnLeft");
    const rightButton = document.getElementById("btnRight");
    const downButton = document.getElementById("btnDown");
    const rotateCCWButton = document.getElementById("btnRotateCCW");
    const rotateCWButton = document.getElementById("btnRotateCW");
    const vibrationButton = document.getElementById("btnVibration");
    updateVibrationButton();

    leftButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        moveCapsule(-1);
        vibrateTap();
    });

    rightButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        moveCapsule(1);
        vibrateTap();
    });

    downButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        fastDrop = true;
        vibrateTap();
    });

    ["pointerup", "pointerleave", "pointercancel"].forEach((evt) => {
        downButton.addEventListener(evt, () => {
            fastDrop = false;
        });
    });

    rotateCWButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        rotateCapsule("cw");
        vibrateTap();
    });

    rotateCCWButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        rotateCapsule("ccw");
        vibrateTap();
    });

    vibrationButton?.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        vibrationEnabled = !vibrationEnabled;
        updateVibrationButton();
        vibrateTap();
    });

    window.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar", "z", "Z", "x", "X"].includes(event.key)) {
            event.preventDefault();
        }

        if (gameOver) {
            return;
        }

        switch (event.key) {
            case "ArrowLeft":
                moveCapsule(-1);
                vibrateTap();
                break;
            case "ArrowRight":
                moveCapsule(1);
                vibrateTap();
                break;
            case "ArrowUp":
            case "x":
            case "X":
                rotateCapsule("cw");
                vibrateTap();
                break;
            case " ":
            case "Spacebar":
            case "ArrowDown":
                fastDrop = true;
                vibrateTap();
                break;
            case "z":
            case "Z":
                rotateCapsule("ccw");
                vibrateTap();
                break;
            default:
                break;
        }
    });

    window.addEventListener("keyup", (event) => {
        if ([" ", "Spacebar", "ArrowDown"].includes(event.key)) {
            fastDrop = false;
        }
    });

    window.addEventListener("blur", () => {
        fastDrop = false;
    });
}

function setupLevelControls() {
    if (!levelSlider || !levelValue || !startLevelButton || !levelOverlay) {
        return;
    }
    levelValue.textContent = levelSlider.value;
    levelSlider.addEventListener("input", () => {
        levelValue.textContent = levelSlider.value;
    });
    startLevelButton.addEventListener("click", () => {
        const selectedLevel = Number(levelSlider.value);
        startLevel(selectedLevel);
    });
    levelToggleButton?.addEventListener("click", () => {
        showLevelOverlay();
    });
}

function showLevelOverlay() {
    if (!levelOverlay) {
        return;
    }
    levelSlider.value = String(currentLevel);
    levelValue.textContent = String(currentLevel);
    levelOverlay.classList.remove("hidden");
    isGameRunning = false;
    fastDrop = false;
}

function hideLevelOverlay() {
    levelOverlay?.classList.add("hidden");
}

function startLevel(level) {
    if (!assetsReady) {
        return;
    }
    currentLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
    levelCleared = false;
    hideLevelOverlay();
    isGameRunning = true;
    initGame();
}

function loadAssets() {
    const loaders = Object.entries(assetSources).map(([key, src]) =>
        loadImage(`assets/${src}`).then((img) => {
            images[key] = img;
        })
    );

    return Promise.all(loaders);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function placeVirusesForLevel(level) {
    const baseViruses = 8;
    const perLevel = 3;
    let targetViruses = baseViruses + perLevel * level;
    const minRow = Math.max(SAFE_ROWS, FIELD_ROWS - 6 - Math.floor(level / 2));
    const availableRows = FIELD_ROWS - minRow;
    const maxViruses = availableRows * FIELD_COLS - 4;
    targetViruses = Math.max(4, Math.min(targetViruses, maxViruses));

    let placed = 0;
    let guard = 0;
    while (placed < targetViruses && guard < 4000) {
        const row = getRandomInt(minRow, FIELD_ROWS - 1);
        const col = getRandomInt(0, FIELD_COLS - 1);
        if (board[row][col] !== 0) {
            guard += 1;
            continue;
        }
        const color = COLOR_NAMES[getRandomInt(0, COLOR_NAMES.length - 1)];
        board[row][col] = COLOR_CODES[color];
        placed += 1;
        guard += 1;
    }
}

function gameLoop(timestamp) {
    if (!assetsReady) {
        return;
    }

    update(timestamp);
    draw();
    requestAnimationFrame(gameLoop);
}

function update(timestamp) {
    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }
    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (!isGameRunning) {
        return;
    }

    if (gameOver) {
        return;
    }

    if (fallingPieces.length > 0) {
        updateFallingPieces(delta);
        return;
    }

    if (gravityPending) {
        const hasFalling = prepareGravityAnimation();
        if (hasFalling) {
            gravityPending = false;
            return;
        }
        gravityPending = false;
    }

    if (pendingMatches) {
        const cleared = clearMatches();
        if (cleared > 0) {
            score += cleared * 50;
            pendingMatches = false;
            return;
        }
        pendingMatches = false;
    }

    if (pendingLevelClear && fallingPieces.length === 0 && !gravityPending && !pendingMatches) {
        handleLevelClear();
        return;
    }

    if (!activeCapsule) {
        spawnCapsule();
        return;
    }

    const interval = fastDrop ? FAST_DROP_INTERVAL : NORMAL_DROP_INTERVAL;
    if (timestamp - lastDropTime >= interval) {
        const moved = tryMoveCapsule(1, 0);
        if (moved) {
            lastDropTime = timestamp;
        } else {
            lockCapsule();
            lastDropTime = timestamp;
        }
    }
}

function moveCapsule(direction) {
    if (!activeCapsule || gameOver) {
        return;
    }
    tryMoveCapsule(0, direction);
}

function tryMoveCapsule(rowOffset, colOffset) {
    const segments = getSegmentPositions(activeCapsule, activeCapsule.orientation, rowOffset, colOffset);
    if (!canPlaceSegments(segments)) {
        return false;
    }
    activeCapsule.row += rowOffset;
    activeCapsule.col += colOffset;
    return true;
}

function rotateCapsule(direction = "cw") {
    if (!activeCapsule || gameOver) {
        return false;
    }
    const currentIndex = ORIENTATIONS.indexOf(activeCapsule.orientation);
    const delta = direction === "ccw" ? -1 : 1;
    const nextIndex = (currentIndex + delta + ORIENTATIONS.length) % ORIENTATIONS.length;
    const nextOrientation = ORIENTATIONS[nextIndex];
    const kicks = [
        { row: 0, col: 0 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
        { row: -1, col: 0 },
        { row: 1, col: 0 }
    ];

    for (const kick of kicks) {
        const rotated = getSegmentPositions(activeCapsule, nextOrientation, kick.row, kick.col);
        if (canPlaceSegments(rotated)) {
            activeCapsule.orientation = nextOrientation;
            activeCapsule.row += kick.row;
            activeCapsule.col += kick.col;
            return true;
        }
    }
    return false;
}

function getSegmentPositions(capsule, orientation = capsule.orientation, rowOffset = 0, colOffset = 0) {
    const offset = ORIENTATION_OFFSETS[orientation] || ORIENTATION_OFFSETS.right;
    return [
        {
            row: capsule.row + rowOffset,
            col: capsule.col + colOffset,
            color: capsule.colors[0]
        },
        {
            row: capsule.row + rowOffset + offset.row,
            col: capsule.col + colOffset + offset.col,
            color: capsule.colors[1]
        }
    ];
}

function determineSegmentVariants(segments) {
    if (segments.length < 2) {
        return segments.map(() => "top");
    }
    const [first, second] = segments;
    if (first.row === second.row) {
        if (first.col < second.col) {
            return ["left", "right"];
        }
        return ["right", "left"];
    }
    if (first.row < second.row) {
        return ["top", "bottom"];
    }
    return ["bottom", "top"];
}


function canPlaceSegments(segments) {
    return segments.every((segment) => {
        if (segment.col < 0 || segment.col >= FIELD_COLS) {
            return false;
        }
        if (segment.row >= FIELD_ROWS) {
            return false;
        }
        if (segment.row < 0) {
            return true;
        }
        return board[segment.row][segment.col] === 0;
    });
}

function lockCapsule() {
    const segments = getSegmentPositions(activeCapsule);
    let touchedTop = false;
    const pairId = nextCapsuleId++;
    capsulePairCounts.set(pairId, segments.length);
    const variants = determineSegmentVariants(segments);
    segments.forEach((segment, index) => {
        if (segment.row < 0) {
            touchedTop = true;
            return;
        }
        board[segment.row][segment.col] = COLOR_CODES[segment.color] + 10;
        capsuleIdBoard[segment.row][segment.col] = pairId;
        capsuleVariantBoard[segment.row][segment.col] = variants[index];
    });
    if (touchedTop) {
        gameOver = true;
        capsulePairCounts.delete(pairId);
    }
    activeCapsule = null;
    if (!gameOver) {
        pendingMatches = true;
    }
}

function spawnCapsule() {
    if (gameOver) {
        return;
    }
    if (!nextCapsuleData) {
        nextCapsuleData = createRandomCapsuleData();
    }
    const capsule = {
        row: -1,
        col: Math.floor(FIELD_COLS / 2) - 1,
        orientation: nextCapsuleData.orientation,
        colors: [...nextCapsuleData.colors]
    };
    nextCapsuleData = createRandomCapsuleData();
    const segments = getSegmentPositions(capsule);
    if (!canPlaceSegments(segments)) {
        gameOver = true;
        activeCapsule = null;
        return;
    }
    activeCapsule = capsule;
    lastDropTime = performance.now();
}

function clearMatches() {
    const marked = Array.from({ length: FIELD_ROWS }, () => Array(FIELD_COLS).fill(false));
    let clearedCount = 0;

    // Horizontal check
    for (let row = 0; row < FIELD_ROWS; row += 1) {
        let col = 0;
        while (col < FIELD_COLS) {
            const color = codeToColor(board[row][col]);
            if (!color) {
                col += 1;
                continue;
            }
            let runLength = 1;
            while (col + runLength < FIELD_COLS && codeToColor(board[row][col + runLength]) === color) {
                runLength += 1;
            }
            if (runLength >= 4) {
                for (let i = 0; i < runLength; i += 1) {
                    marked[row][col + i] = true;
                }
            }
            col += runLength;
        }
    }

    // Vertical check
    for (let col = 0; col < FIELD_COLS; col += 1) {
        let row = 0;
        while (row < FIELD_ROWS) {
            const color = codeToColor(board[row][col]);
            if (!color) {
                row += 1;
                continue;
            }
            let runLength = 1;
            while (row + runLength < FIELD_ROWS && codeToColor(board[row + runLength][col]) === color) {
                runLength += 1;
            }
            if (runLength >= 4) {
                for (let i = 0; i < runLength; i += 1) {
                    marked[row + i][col] = true;
                }
            }
            row += runLength;
        }
    }

    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            if (marked[row][col] && board[row][col] !== 0) {
                removeBoardObject(row, col);
                clearedCount += 1;
            }
        }
    }

    if (clearedCount > 0) {
        vibrateClear();
        remainingViruses = countViruses();
        gravityPending = true;
        if (remainingViruses === 0) {
            pendingLevelClear = true;
        }
    }

    return clearedCount;
}

function prepareGravityAnimation() {
    const pieces = gatherPieces();
    if (pieces.length === 0) {
        return false;
    }

    const shadowBoard = board.map((row) => [...row]);

    let moved = false;
    while (true) {
        const movable = pieces.filter((piece) => canPieceMoveDownOne(piece, shadowBoard));
        if (movable.length === 0) {
            break;
        }
        moved = true;
        movable.forEach((piece) => {
            piece.cells.forEach((cell) => {
                shadowBoard[cell.row][cell.col] = 0;
            });
        });
        movable.forEach((piece) => {
            piece.cells.forEach((cell) => {
                cell.row += 1;
                shadowBoard[cell.row][cell.col] = cell.code;
            });
            piece.rowsRemaining += 1;
        });
    }

    const movingPieces = pieces.filter((piece) => piece.rowsRemaining > 0);
    if (!moved || movingPieces.length === 0) {
        return false;
    }

    movingPieces.forEach((piece) => {
        piece.startCells.forEach((cell) => {
            board[cell.row][cell.col] = 0;
            capsuleVariantBoard[cell.row][cell.col] = null;
            if (piece.pairId) {
                capsuleIdBoard[cell.row][cell.col] = 0;
                capsulePairCounts.delete(piece.pairId);
            }
        });
    });

    fallingPieces = movingPieces.map((piece) => ({
        cells: piece.startCells.map((startCell, index) => ({
            row: startCell.row,
            col: startCell.col,
            code: startCell.code,
            variant: startCell.variant,
            targetRow: piece.cells[index].row
        })),
        pairId: piece.pairId,
        rowsRemaining: piece.rowsRemaining,
        fallTimer: 0,
        settled: false
    }));

    return fallingPieces.length > 0;
}

function gatherPieces() {
    const pieces = [];
    const visitedPairs = new Set();

    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            const code = board[row][col];
            if (!isCapsule(code)) {
                continue;
            }
            const pairId = capsuleIdBoard[row][col];
            if (pairId) {
                if (visitedPairs.has(pairId)) {
                    continue;
                }
                visitedPairs.add(pairId);
                const cells = collectPairCells(pairId);
                pieces.push(createPiece(cells, pairId));
            } else {
                const variant = capsuleVariantBoard[row][col] || "top";
                const cells = [{ row, col, code, variant }];
                pieces.push(createPiece(cells, null));
            }
        }
    }

    pieces.sort(
        (a, b) =>
            Math.max(...b.cells.map((cell) => cell.row)) -
            Math.max(...a.cells.map((cell) => cell.row))
    );
    return pieces;
}

function createPiece(cells, pairId) {
    const sortedCells = cells
        .map((cell, index) => ({
            row: cell.row,
            col: cell.col,
            code: cell.code,
            variant: cell.variant || "top",
            index
        }))
        .sort((a, b) => a.index - b.index);
    return {
        pairId,
        startCells: sortedCells.map((cell) => ({ ...cell })),
        cells: sortedCells.map((cell) => ({ ...cell })),
        rowsRemaining: 0
    };
}

function canPieceMoveDownOne(piece, boardState) {
    return piece.cells.every((cell) => {
        const nextRow = cell.row + 1;
        if (nextRow >= FIELD_ROWS) {
            return false;
        }
        const occupant = boardState[nextRow][cell.col];
        if (occupant === 0) {
            return true;
        }
        return piece.cells.some(
            (other) => other.row === nextRow && other.col === cell.col
        );
    });
}

function collectPairCells(pairId) {
    const cells = [];
    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            if (capsuleIdBoard[row][col] === pairId) {
                cells.push({
                    row,
                    col,
                    code: board[row][col],
                    variant: capsuleVariantBoard[row][col] || "top"
                });
            }
        }
    }
    return cells;
}

function updateFallingPieces(delta) {
    if (fallingPieces.length === 0) {
        return;
    }
    fallingPieces.sort((a, b) => getPieceBottomRow(b) - getPieceBottomRow(a));

    fallingPieces.forEach((piece) => {
        if (piece.settled || piece.rowsRemaining <= 0) {
            return;
        }
        piece.fallTimer += delta;
        while (piece.rowsRemaining > 0 && piece.fallTimer >= AUTO_FALL_INTERVAL) {
            piece.fallTimer -= AUTO_FALL_INTERVAL;
            piece.cells.forEach((cell) => {
                cell.row += 1;
            });
            piece.rowsRemaining -= 1;
            if (piece.rowsRemaining <= 0) {
                settleFallingPiece(piece);
            }
        }
    });

    fallingPieces = fallingPieces.filter((piece) => !piece.settled);
    if (fallingPieces.length === 0) {
        pendingMatches = true;
    }
}

function getPieceBottomRow(piece) {
    return piece.cells.reduce((maxRow, cell) => Math.max(maxRow, cell.row), -Infinity);
}

function draw() {
    if (!assetsReady) {
        return;
    }

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground();
    drawField();
    drawBoardBlocks();
    drawActiveCapsule();
    drawFallingPieces();
    drawDoctorCat();
    drawHeader();
    drawNextCapsule();
    if (levelCleared) {
        drawLevelClear();
    } else if (gameOver) {
        drawGameOver();
    }
}

function drawBackground() {
    const bg = images.bg;
    if (bg) {
        ctx.drawImage(bg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        ctx.fillStyle = "#f0e6ff";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    const bottle = images.bottle;
    if (bottle) {
        ctx.drawImage(bottle, FRAME_POSITION.x, FRAME_POSITION.y);
    }
}

function drawField() {
    const tile = images.cell;
    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            const x = FIELD_ORIGIN.x + col * CELL_SIZE;
            const y = FIELD_ORIGIN.y + row * CELL_SIZE;
            if (tile) {
                ctx.drawImage(tile, x, y, CELL_SIZE, CELL_SIZE);
            } else {
                ctx.fillStyle = "rgba(255,255,255,0.3)";
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            }
        }
    }
}

function drawBoardBlocks() {
    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            const code = board[row][col];
            if (code === 0) {
                continue;
            }
            const color = codeToColor(code);
            const x = FIELD_ORIGIN.x + col * CELL_SIZE;
            const y = FIELD_ORIGIN.y + row * CELL_SIZE;
            if (code >= 10) {
                const variant = capsuleVariantBoard[row][col] || "top";
                drawCapsuleFragment(color, variant, x, y);
            } else {
                drawVirus(color, x, y);
            }
        }
    }
}

function drawActiveCapsule() {
    if (!activeCapsule) {
        return;
    }
    const segments = getSegmentPositions(activeCapsule);
    const variants = determineSegmentVariants(segments);
    segments.forEach((segment, index) => {
        if (segment.row < 0) {
            return;
        }
        const x = FIELD_ORIGIN.x + segment.col * CELL_SIZE;
        const y = FIELD_ORIGIN.y + segment.row * CELL_SIZE;
        drawCapsuleFragment(segment.color, variants[index], x, y);
    });
}

function drawFallingPieces() {
    if (fallingPieces.length === 0) {
        return;
    }
    fallingPieces.forEach((piece) => {
        piece.cells.forEach((cell) => {
            const color = codeToColor(cell.code);
            const x = FIELD_ORIGIN.x + cell.col * CELL_SIZE;
            const y = FIELD_ORIGIN.y + cell.row * CELL_SIZE;
            drawCapsuleFragment(color, cell.variant || "top", x, y);
        });
    });
}

function settleFallingPiece(piece) {
    piece.settled = true;
    piece.fallTimer = 0;
    piece.cells.forEach((cell) => {
        board[cell.row][cell.col] = cell.code;
        capsuleVariantBoard[cell.row][cell.col] = cell.variant || null;
        if (piece.pairId) {
            capsuleIdBoard[cell.row][cell.col] = piece.pairId;
        }
    });
    if (piece.pairId) {
        capsulePairCounts.set(piece.pairId, piece.cells.length);
    }
}

function drawCapsuleFragment(color, variant, x, y, size = CELL_SIZE) {
    const suffix = getVariantSuffix(variant);
    const key = `capsule_${color}_${suffix}`;
    const image = images[key];
    if (image) {
        ctx.drawImage(image, x, y, size, size);
    } else {
        ctx.fillStyle = color;
        const padding = Math.max(Math.floor(size * 0.15), 2);
        ctx.fillRect(x + padding, y + padding, size - padding * 2, size - padding * 2);
    }
}

function getVariantSuffix(variant) {
    switch (variant) {
        case "bottom":
            return "bottom";
        case "left":
            return "left";
        case "right":
            return "right";
        case "top":
        default:
            return "top";
    }
}

function drawVirus(color, x, y) {
    const key = `virus_${color}`;
    const image = images[key];
    if (image) {
        ctx.drawImage(image, x, y, CELL_SIZE, CELL_SIZE);
    } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawDoctorCat() {
    const cat = images.doctor;
    if (!cat) {
        return;
    }
    const x = FRAME_POSITION.x + 310;
    const y = FRAME_POSITION.y + 140;
    ctx.drawImage(cat, x, y, 96, 96);
}

function drawHeader() {
    ctx.fillStyle = "#ffffff";
    ctx.font = "24px 'Fredoka', 'Noto Sans JP', sans-serif";
    ctx.fillText("にゃんこドクター", 28, 40);
    ctx.font = "18px 'Fredoka', 'Noto Sans JP', sans-serif";
    ctx.fillText(`SCORE: ${score}`, 28, 66);
    ctx.fillText(`LEVEL: ${currentLevel}`, 28, 88);
    ctx.fillText(`ウイルス: ${remainingViruses}`, 28, 110);
}

function drawNextCapsule() {
    if (!nextCapsuleData) {
        return;
    }
    const previewOrientation =
        nextCapsuleData.orientation === "left" ? "right" :
        nextCapsuleData.orientation === "up" ? "down" :
        nextCapsuleData.orientation;
    const previewCapsule = {
        row: 0,
        col: 0,
        orientation: previewOrientation,
        colors: nextCapsuleData.colors
    };
    const segments = getSegmentPositions(previewCapsule);
    const variants = determineSegmentVariants(segments);

    ctx.fillStyle = "#ffffff";
    ctx.font = "18px 'Fredoka', 'Noto Sans JP', sans-serif";
    ctx.fillText("NEXT", PREVIEW_ORIGIN.x, PREVIEW_ORIGIN.y - 6);

    segments.forEach((segment, index) => {
        const x = PREVIEW_ORIGIN.x + segment.col * PREVIEW_SPACING;
        const y = PREVIEW_ORIGIN.y + segment.row * PREVIEW_SPACING;
        drawCapsuleFragment(
            segment.color,
            variants[index],
            x,
            y,
            PREVIEW_CELL_SIZE
        );
    });
}

function drawGameOver() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(FIELD_ORIGIN.x, FIELD_ORIGIN.y + 96, FIELD_COLS * CELL_SIZE, 160);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px 'Fredoka', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, FIELD_ORIGIN.y + 170);
    ctx.font = "20px 'Fredoka', sans-serif";
    ctx.fillText("Tap to restart", CANVAS_WIDTH / 2, FIELD_ORIGIN.y + 210);
    ctx.textAlign = "start";
}

canvas.addEventListener("pointerdown", () => {
    if (levelCleared) {
        const nextLevel = Math.min(currentLevel + 1, MAX_LEVEL);
        levelCleared = false;
        pendingLevelClear = false;
        startLevel(nextLevel);
        return;
    }
    if (gameOver && isGameRunning) {
        initGame();
    }
});

function handleLevelClear() {
    if (levelCleared) {
        return;
    }
    pendingLevelClear = false;
    levelCleared = true;
    isGameRunning = false;
    fastDrop = false;
    gravityPending = false;
    pendingMatches = false;
    fallingPieces = [];
    activeCapsule = null;
}

function drawLevelClear() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(FIELD_ORIGIN.x, FIELD_ORIGIN.y + 80, FIELD_COLS * CELL_SIZE, 200);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px 'Fredoka', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LEVEL CLEAR!", CANVAS_WIDTH / 2, FIELD_ORIGIN.y + 150);
    const nextLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    ctx.font = "20px 'Fredoka', sans-serif";
    ctx.fillText(`Tap to go to LEVEL ${nextLevel}`, CANVAS_WIDTH / 2, FIELD_ORIGIN.y + 190);
    ctx.textAlign = "start";
}

function vibratePattern(pattern) {
    if (!vibrationEnabled || !supportsVibration) {
        return;
    }
    navigator.vibrate(pattern);
}

function vibrateTap() {
    vibratePattern(HAPTIC_TAP_DURATION);
}

function vibrateClear() {
    vibratePattern(HAPTIC_CLEAR_PATTERN);
}

function updateVibrationButton() {
    const button = document.getElementById("btnVibration");
    if (!button) {
        return;
    }
    button.textContent = vibrationEnabled ? "バイブ: ON" : "バイブ: OFF";
    button.setAttribute("aria-pressed", String(vibrationEnabled));
}

function removeBoardObject(row, col) {
    const code = board[row][col];
    if (code === 0) {
        return;
    }
    if (isCapsule(code)) {
        const pairId = capsuleIdBoard[row][col];
        if (pairId) {
            const nextCount = (capsulePairCounts.get(pairId) || 0) - 1;
            if (nextCount <= 0) {
                capsulePairCounts.delete(pairId);
            } else if (nextCount === 1) {
                detachRemainingPairHalf(pairId, row, col);
                capsulePairCounts.delete(pairId);
            } else {
                capsulePairCounts.set(pairId, nextCount);
            }
        }
        capsuleIdBoard[row][col] = 0;
    }
    board[row][col] = 0;
    capsuleVariantBoard[row][col] = null;
}

function detachRemainingPairHalf(pairId, removedRow, removedCol) {
    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            if (row === removedRow && col === removedCol) {
                continue;
            }
            if (capsuleIdBoard[row][col] === pairId) {
                capsuleIdBoard[row][col] = 0;
                return;
            }
        }
    }
}

function isVirus(code) {
    return code > 0 && code < 10;
}

function isCapsule(code) {
    return code >= 10;
}

function codeToColor(code) {
    if (!code) {
        return null;
    }
    const normalized = code % 10;
    switch (normalized) {
        case 1:
            return "red";
        case 2:
            return "blue";
        case 3:
            return "yellow";
        default:
            return null;
    }
}

function getRandomInt(min, max) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
}

function countViruses() {
    let count = 0;
    for (let row = 0; row < FIELD_ROWS; row += 1) {
        for (let col = 0; col < FIELD_COLS; col += 1) {
            if (isVirus(board[row][col])) {
                count += 1;
            }
        }
    }
    return count;
}
