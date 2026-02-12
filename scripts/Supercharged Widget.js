// Supercharged Insulin Tracker — Lock Screen Widget for Scriptable
// Widget type: accessoryRectangular (large lock screen widget)
//
// SETUP:
// 1. Install "Scriptable" from the App Store
// 2. Create a new script, paste this entire file
// 3. Go to Lock Screen > Customize > Add Widget > Scriptable
// 4. Choose "Rectangular" widget
// 5. Long-press the widget > Edit Widget > choose this script
//
// The widget shows: IOB (units), last glucose reading, and a 3-hour sparkline

const SITE_URL = "https://danny-insulin.netlify.app";
const API_KEY = "T7kQm9Xp2LvN4wRj8YhB5sG1fD6zA3cE";
const TARGET_LOW = 70;
const TARGET_HIGH = 160;
const FIDELITY_GREEN = new Color("#00843D");

async function fetchWidgetData() {
  const url = `${SITE_URL}/api/widget?key=${API_KEY}`;
  const req = new Request(url);
  req.timeoutInterval = 10;
  try {
    const data = await req.loadJSON();
    return data;
  } catch (e) {
    return null;
  }
}

function drawSparkline(data, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  if (!data || data.length < 2) {
    // No data — draw flat line
    ctx.setStrokeColor(Color.gray());
    ctx.setLineWidth(1);
    const path = new Path();
    path.move(new Point(0, height / 2));
    path.addLine(new Point(width, height / 2));
    ctx.addPath(path);
    ctx.strokePath();
    return ctx.getImage();
  }

  const values = data.map(d => d.v);
  const minVal = Math.min(50, ...values);
  const maxVal = Math.max(200, ...values);
  const range = maxVal - minVal;

  // Draw target range band
  const targetTopY = height - ((TARGET_HIGH - minVal) / range) * height;
  const targetBottomY = height - ((TARGET_LOW - minVal) / range) * height;
  ctx.setFillColor(new Color("#00843D", 0.15));
  ctx.fillRect(new Rect(0, targetTopY, width, targetBottomY - targetTopY));

  // Draw glucose line
  const path = new Path();
  const stepX = width / (data.length - 1);

  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = height - ((data[i].v - minVal) / range) * height;
    if (i === 0) {
      path.move(new Point(x, y));
    } else {
      path.addLine(new Point(x, y));
    }
  }

  ctx.setStrokeColor(new Color("#3b82f6"));
  ctx.setLineWidth(1.5);
  ctx.addPath(path);
  ctx.strokePath();

  // Draw last point dot
  const lastX = (data.length - 1) * stepX;
  const lastY = height - ((values[values.length - 1] - minVal) / range) * height;
  ctx.setFillColor(new Color("#3b82f6"));
  ctx.fillEllipse(new Rect(lastX - 2, lastY - 2, 4, 4));

  return ctx.getImage();
}

function getGlucoseColor(value) {
  if (value === null || value === undefined) return Color.gray();
  if (value < TARGET_LOW) return new Color("#ef4444");
  if (value > TARGET_HIGH) return new Color("#ef4444");
  return new Color("#3b82f6");
}

function timeSince(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

async function createWidget() {
  const data = await fetchWidgetData();
  const widget = new ListWidget();
  widget.setPadding(4, 4, 4, 4);

  if (!data || data.updatedAt === null) {
    // No data yet
    const t = widget.addText("No data");
    t.font = Font.mediumSystemFont(12);
    t.textColor = Color.gray();
    return widget;
  }

  // Top row: IOB + Last Glucose
  const topStack = widget.addStack();
  topStack.layoutHorizontally();
  topStack.centerAlignContent();

  // IOB section
  const iobStack = topStack.addStack();
  iobStack.layoutVertically();

  const iobLabel = iobStack.addText("IOB");
  iobLabel.font = Font.boldSystemFont(8);
  iobLabel.textColor = FIDELITY_GREEN;

  const iobValue = iobStack.addText(`${data.iob.toFixed(1)}u`);
  iobValue.font = Font.boldMonospacedSystemFont(16);
  iobValue.textColor = Color.white();
  iobValue.minimumScaleFactor = 0.6;

  topStack.addSpacer(8);

  // Glucose section
  const glucoseStack = topStack.addStack();
  glucoseStack.layoutVertically();

  if (data.lastGlucose !== null) {
    const bgLabel = glucoseStack.addText("BG");
    bgLabel.font = Font.boldSystemFont(8);
    bgLabel.textColor = getGlucoseColor(data.lastGlucose);

    const bgRow = glucoseStack.addStack();
    bgRow.layoutHorizontally();
    bgRow.bottomAlignContent();

    const bgValue = bgRow.addText(`${data.lastGlucose}`);
    bgValue.font = Font.boldMonospacedSystemFont(16);
    bgValue.textColor = getGlucoseColor(data.lastGlucose);
    bgValue.minimumScaleFactor = 0.6;

    const bgUnit = bgRow.addText(" mg/dL");
    bgUnit.font = Font.systemFont(7);
    bgUnit.textColor = Color.gray();
  } else {
    const noGlucose = glucoseStack.addText("No BG");
    noGlucose.font = Font.systemFont(10);
    noGlucose.textColor = Color.gray();
  }

  topStack.addSpacer();

  // Timestamp
  const timeStack = topStack.addStack();
  timeStack.layoutVertically();
  const ago = timeStack.addText(timeSince(data.lastGlucoseTime));
  ago.font = Font.systemFont(8);
  ago.textColor = Color.gray();
  ago.rightAlignText();

  widget.addSpacer(2);

  // Sparkline graph
  const sparkImage = drawSparkline(data.glucoseHistory, 300, 60);
  const imgStack = widget.addStack();
  imgStack.layoutHorizontally();
  const img = imgStack.addImage(sparkImage);
  img.imageSize = new Size(300, 40);

  return widget;
}

// Run
const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // Preview when running in-app
  widget.presentAccessoryRectangular();
}

Script.complete();
