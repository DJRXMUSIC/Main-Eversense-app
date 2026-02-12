// Supercharged Insulin Tracker — Home Screen Widget for Scriptable
// Widget type: Medium (Home Screen)
//
// SETUP:
// 1. Install "Scriptable" from the App Store
// 2. Create a new script, paste this entire file
// 3. Add a Scriptable widget to Home Screen (medium size)
// 4. Long-press > Edit Widget > choose this script

const SITE_URL = "https://danny-insulin.netlify.app";
const API_KEY = "T7kQm9Xp2LvN4wRj8YhB5sG1fD6zA3cE";
const TARGET_LOW = 70;
const TARGET_HIGH = 160;
const FIDELITY_GREEN = new Color("#00843D");
const BG_COLOR = new Color("#1a1a1a");
const CARD_BG = new Color("#2a2a2a");
const BLUE = new Color("#3b82f6");
const RED = new Color("#ef4444");

async function fetchWidgetData() {
  const url = `${SITE_URL}/api/widget?key=${API_KEY}`;
  const req = new Request(url);
  req.timeoutInterval = 10;
  try {
    return await req.loadJSON();
  } catch (e) {
    return null;
  }
}

function drawGraph(data, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  if (!data || data.length < 2) {
    ctx.setStrokeColor(Color.gray());
    ctx.setLineWidth(1);
    const p = new Path();
    p.move(new Point(0, height / 2));
    p.addLine(new Point(width, height / 2));
    ctx.addPath(p);
    ctx.strokePath();
    return ctx.getImage();
  }

  const values = data.map(d => d.v);
  const minVal = Math.min(50, ...values);
  const maxVal = Math.max(250, ...values);
  const range = maxVal - minVal;
  const pad = 4;
  const graphW = width - pad * 2;
  const graphH = height - pad * 2;

  function toX(i) { return pad + (i / (data.length - 1)) * graphW; }
  function toY(v) { return pad + graphH - ((v - minVal) / range) * graphH; }

  // Target range band
  const targetTopY = toY(TARGET_HIGH);
  const targetBottomY = toY(TARGET_LOW);
  ctx.setFillColor(new Color("#00843D", 0.12));
  ctx.fillRect(new Rect(pad, targetTopY, graphW, targetBottomY - targetTopY));

  // Target range lines (dashed effect via dots)
  ctx.setFillColor(new Color("#00843D", 0.3));
  for (let x = pad; x < width - pad; x += 6) {
    ctx.fillRect(new Rect(x, targetTopY, 2, 0.5));
    ctx.fillRect(new Rect(x, targetBottomY, 2, 0.5));
  }

  // Glucose line with gradient coloring
  for (let i = 1; i < data.length; i++) {
    const x1 = toX(i - 1);
    const y1 = toY(data[i - 1].v);
    const x2 = toX(i);
    const y2 = toY(data[i].v);

    const avgVal = (data[i - 1].v + data[i].v) / 2;
    const lineColor = (avgVal < TARGET_LOW || avgVal > TARGET_HIGH) ? RED : BLUE;

    const seg = new Path();
    seg.move(new Point(x1, y1));
    seg.addLine(new Point(x2, y2));
    ctx.setStrokeColor(lineColor);
    ctx.setLineWidth(2.5);
    ctx.addPath(seg);
    ctx.strokePath();
  }

  // Dots at each reading
  for (let i = 0; i < data.length; i++) {
    // Only draw dots at reasonable intervals to avoid clutter
    if (data.length > 30 && i % 3 !== 0 && i !== data.length - 1) continue;
    const x = toX(i);
    const y = toY(data[i].v);
    const color = (data[i].v < TARGET_LOW || data[i].v > TARGET_HIGH) ? RED : BLUE;
    ctx.setFillColor(color);
    ctx.fillEllipse(new Rect(x - 2, y - 2, 4, 4));
  }

  // Last point — larger with white border
  const lastX = toX(data.length - 1);
  const lastY = toY(values[values.length - 1]);
  const lastColor = (values[values.length - 1] < TARGET_LOW || values[values.length - 1] > TARGET_HIGH) ? RED : BLUE;
  ctx.setFillColor(Color.white());
  ctx.fillEllipse(new Rect(lastX - 5, lastY - 5, 10, 10));
  ctx.setFillColor(lastColor);
  ctx.fillEllipse(new Rect(lastX - 3.5, lastY - 3.5, 7, 7));

  // Y-axis labels
  ctx.setFont(Font.systemFont(8));
  ctx.setTextColor(new Color("#ffffff", 0.4));
  const yLabels = [TARGET_LOW, TARGET_HIGH];
  for (const v of yLabels) {
    const y = toY(v);
    ctx.drawTextInRect(`${v}`, new Rect(pad, y - 10, 24, 12));
  }

  return ctx.getImage();
}

function getGlucoseColor(value) {
  if (value === null || value === undefined) return Color.gray();
  if (value < TARGET_LOW || value > TARGET_HIGH) return RED;
  return BLUE;
}

function timeSince(isoString) {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function trendArrow(data) {
  if (!data || data.length < 3) return "";
  const recent = data.slice(-3).map(d => d.v);
  const diff = recent[recent.length - 1] - recent[0];
  if (diff > 15) return " ↑";
  if (diff > 5) return " ↗";
  if (diff < -15) return " ↓";
  if (diff < -5) return " ↘";
  return " →";
}

async function createWidget() {
  const data = await fetchWidgetData();
  const widget = new ListWidget();
  widget.backgroundColor = BG_COLOR;
  widget.setPadding(12, 12, 12, 12);

  if (!data || data.updatedAt === null) {
    const t = widget.addText("Open Supercharged to sync data");
    t.font = Font.mediumSystemFont(14);
    t.textColor = Color.gray();
    return widget;
  }

  // === TOP ROW: Stats ===
  const topStack = widget.addStack();
  topStack.layoutHorizontally();
  topStack.centerAlignContent();

  // IOB
  const iobCard = topStack.addStack();
  iobCard.layoutVertically();
  iobCard.setPadding(6, 10, 6, 10);
  iobCard.backgroundColor = CARD_BG;
  iobCard.cornerRadius = 10;

  const iobLabel = iobCard.addText("IOB");
  iobLabel.font = Font.boldSystemFont(9);
  iobLabel.textColor = FIDELITY_GREEN;

  const iobRow = iobCard.addStack();
  iobRow.layoutHorizontally();
  iobRow.bottomAlignContent();
  const iobVal = iobRow.addText(`${data.iob.toFixed(1)}`);
  iobVal.font = Font.boldMonospacedSystemFont(22);
  iobVal.textColor = Color.white();
  iobVal.minimumScaleFactor = 0.7;
  const iobUnit = iobRow.addText("u");
  iobUnit.font = Font.systemFont(12);
  iobUnit.textColor = new Color("#ffffff", 0.5);

  topStack.addSpacer(8);

  // BG
  const bgCard = topStack.addStack();
  bgCard.layoutVertically();
  bgCard.setPadding(6, 10, 6, 10);
  bgCard.backgroundColor = CARD_BG;
  bgCard.cornerRadius = 10;

  const bgLabel = bgCard.addText("Blood Glucose");
  bgLabel.font = Font.boldSystemFont(9);
  bgLabel.textColor = getGlucoseColor(data.lastGlucose);

  const bgRow = bgCard.addStack();
  bgRow.layoutHorizontally();
  bgRow.bottomAlignContent();

  if (data.lastGlucose !== null) {
    const bgVal = bgRow.addText(`${data.lastGlucose}${trendArrow(data.glucoseHistory)}`);
    bgVal.font = Font.boldMonospacedSystemFont(22);
    bgVal.textColor = getGlucoseColor(data.lastGlucose);
    bgVal.minimumScaleFactor = 0.7;
  } else {
    const noVal = bgRow.addText("—");
    noVal.font = Font.boldMonospacedSystemFont(22);
    noVal.textColor = Color.gray();
  }

  topStack.addSpacer();

  // Timestamp
  const timeStack = topStack.addStack();
  timeStack.layoutVertically();
  const agoText = timeStack.addText(timeSince(data.lastGlucoseTime));
  agoText.font = Font.systemFont(9);
  agoText.textColor = new Color("#ffffff", 0.4);
  agoText.rightAlignText();

  if (data.todayBasal) {
    timeStack.addSpacer(2);
    const basalText = timeStack.addText(`Basal: ${data.todayBasal}u`);
    basalText.font = Font.systemFont(9);
    basalText.textColor = FIDELITY_GREEN;
    basalText.rightAlignText();
  }

  widget.addSpacer(6);

  // === GRAPH ===
  const graphImage = drawGraph(data.glucoseHistory, 600, 160);
  const imgStack = widget.addStack();
  imgStack.addImage(graphImage);

  return widget;
}

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}

Script.complete();
