use avt::{Color, Vt as AvtVt};
use serde::Serialize;
use std::panic;
use wasm_bindgen::prelude::*;

/// Create a new virtual terminal instance
#[wasm_bindgen]
pub fn create(cols: usize, rows: usize, scrollback_limit: usize) -> Vt {
    let vt = AvtVt::builder()
        .size(cols, rows)
        .scrollback_limit(scrollback_limit)
        .build();
    Vt { inner: vt }
}

/// Virtual terminal wrapper
#[wasm_bindgen]
pub struct Vt {
    inner: AvtVt,
}

#[wasm_bindgen]
impl Vt {
    /// Feed input to the terminal and return changed row indices.
    /// Returns null if avt panics (e.g. unsupported sequence) instead of crashing WASM.
    pub fn feed(&mut self, s: &str) -> JsValue {
        let inner = &mut self.inner;
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            let changes = inner.feed_str(s);
            changes.lines.clone()
        }));
        match result {
            Ok(rows) => serde_wasm_bindgen::to_value(&rows).unwrap_or(JsValue::NULL),
            Err(_) => JsValue::NULL,
        }
    }

    /// Get the current terminal view as a structured snapshot (viewport only)
    pub fn get_view(&self) -> JsValue {
        let snapshot = create_snapshot(&self.inner);
        serde_wasm_bindgen::to_value(&snapshot).unwrap_or(JsValue::NULL)
    }

    /// Get all lines (scrollback + viewport), trimmed of trailing empty lines.
    /// Use this for full terminal history capture.
    pub fn get_all_lines(&self) -> JsValue {
        let snapshot = create_full_snapshot(&self.inner);
        serde_wasm_bindgen::to_value(&snapshot).unwrap_or(JsValue::NULL)
    }

    /// Get cursor position as [col, row] or null if cursor is hidden
    pub fn get_cursor(&self) -> JsValue {
        let cursor = self.inner.cursor();
        if cursor.visible {
            let pos = [cursor.col, cursor.row];
            serde_wasm_bindgen::to_value(&pos).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    /// Resize the terminal to new dimensions
    pub fn resize(&mut self, cols: usize, rows: usize) {
        self.inner.resize(cols, rows);
    }

    /// Get terminal size as [cols, rows]
    pub fn get_size(&self) -> JsValue {
        let (cols, rows) = self.inner.size();
        let size = [cols, rows];
        serde_wasm_bindgen::to_value(&size).unwrap_or(JsValue::NULL)
    }
}

/// Serializable terminal snapshot
#[derive(Serialize)]
struct TerminalSnapshot {
    cols: usize,
    rows: usize,
    lines: Vec<SnapshotLine>,
}

/// A line in the snapshot
#[derive(Serialize)]
struct SnapshotLine {
    spans: Vec<SnapshotSpan>,
    // Note: Line.wrapped is pub(crate) in avt, not accessible from outside.
    // We omit it for now; wrapped line merging can be done heuristically if needed.
}

/// A styled span of text
#[derive(Serialize)]
struct SnapshotSpan {
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fg: Option<ColorValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bg: Option<ColorValue>,
    #[serde(skip_serializing_if = "is_false")]
    bold: bool,
    #[serde(skip_serializing_if = "is_false")]
    faint: bool,
    #[serde(skip_serializing_if = "is_false")]
    italic: bool,
    #[serde(skip_serializing_if = "is_false")]
    underline: bool,
    #[serde(skip_serializing_if = "is_false")]
    strikethrough: bool,
    #[serde(skip_serializing_if = "is_false")]
    blink: bool,
    #[serde(skip_serializing_if = "is_false")]
    inverse: bool,
}

/// Color value: either a palette index (number) or RGB hex string
#[derive(Serialize, Clone, PartialEq)]
#[serde(untagged)]
enum ColorValue {
    Indexed(u8),
    Rgb(String),
}

fn is_false(b: &bool) -> bool {
    !b
}

/// Create a terminal snapshot from avt's view
fn create_snapshot(vt: &AvtVt) -> TerminalSnapshot {
    let (cols, rows) = vt.size();
    let mut lines = Vec::new();

    for line in vt.view() {
        let spans = merge_cells_to_spans(line);
        lines.push(SnapshotLine { spans });
    }

    TerminalSnapshot { cols, rows, lines }
}

/// Create a terminal snapshot from all lines (scrollback + viewport), trimmed of trailing empties.
fn create_full_snapshot(vt: &AvtVt) -> TerminalSnapshot {
    let (cols, rows) = vt.size();
    let mut lines: Vec<SnapshotLine> = Vec::new();

    for line in vt.lines() {
        let spans = merge_cells_to_spans(line);
        lines.push(SnapshotLine { spans });
    }

    // Trim trailing empty lines (lines where all spans are whitespace-only)
    while let Some(last) = lines.last() {
        let is_empty = last.spans.is_empty()
            || last.spans.iter().all(|s| s.text.trim().is_empty());
        if is_empty {
            lines.pop();
        } else {
            break;
        }
    }

    TerminalSnapshot { cols, rows, lines }
}

/// Merge consecutive cells with identical pens into spans
fn merge_cells_to_spans(line: &avt::Line) -> Vec<SnapshotSpan> {
    let mut spans = Vec::new();
    let mut current_text = String::new();
    let mut current_fg: Option<ColorValue> = None;
    let mut current_bg: Option<ColorValue> = None;
    let mut current_bold = false;
    let mut current_faint = false;
    let mut current_italic = false;
    let mut current_underline = false;
    let mut current_strikethrough = false;
    let mut current_blink = false;
    let mut current_inverse = false;

    for cell in line.cells() {
        // Skip zero-width cells (continuation of wide chars)
        if cell.width() == 0 {
            continue;
        }

        let pen = cell.pen();

        // Map colors via accessor methods
        let fg = pen.foreground().map(|c| map_color(&c));
        let bg = pen.background().map(|c| map_color(&c));

        // Use Pen's boolean accessor methods
        let bold = pen.is_bold();
        let faint = pen.is_faint();
        let italic = pen.is_italic();
        let underline = pen.is_underline();
        let strikethrough = pen.is_strikethrough();
        let blink = pen.is_blink();
        let inverse = pen.is_inverse();

        // Check if attributes match the current span
        let attrs_match = fg == current_fg
            && bg == current_bg
            && bold == current_bold
            && faint == current_faint
            && italic == current_italic
            && underline == current_underline
            && strikethrough == current_strikethrough
            && blink == current_blink
            && inverse == current_inverse;

        if attrs_match && !current_text.is_empty() {
            // Continue current span
            current_text.push(cell.char());
        } else {
            // Flush current span if non-empty
            if !current_text.is_empty() {
                spans.push(SnapshotSpan {
                    text: current_text.clone(),
                    fg: current_fg.clone(),
                    bg: current_bg.clone(),
                    bold: current_bold,
                    faint: current_faint,
                    italic: current_italic,
                    underline: current_underline,
                    strikethrough: current_strikethrough,
                    blink: current_blink,
                    inverse: current_inverse,
                });
                current_text.clear();
            }

            // Start new span
            current_text.push(cell.char());
            current_fg = fg;
            current_bg = bg;
            current_bold = bold;
            current_faint = faint;
            current_italic = italic;
            current_underline = underline;
            current_strikethrough = strikethrough;
            current_blink = blink;
            current_inverse = inverse;
        }
    }

    // Flush final span
    if !current_text.is_empty() {
        spans.push(SnapshotSpan {
            text: current_text,
            fg: current_fg,
            bg: current_bg,
            bold: current_bold,
            faint: current_faint,
            italic: current_italic,
            underline: current_underline,
            strikethrough: current_strikethrough,
            blink: current_blink,
            inverse: current_inverse,
        });
    }

    spans
}

/// Map avt Color to serializable ColorValue
fn map_color(color: &Color) -> ColorValue {
    match color {
        Color::Indexed(n) => ColorValue::Indexed(*n),
        Color::RGB(rgb) => {
            let hex = format!("#{:02X}{:02X}{:02X}", rgb.r, rgb.g, rgb.b);
            ColorValue::Rgb(hex)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_feed() {
        let mut vt = create(80, 24, 0);
        let result = vt.feed("hello");
        // Should return changed line indices
        assert!(!result.is_null());
    }

    #[test]
    fn test_get_view() {
        let mut vt = create(80, 24, 0);
        vt.feed("hello world");
        let view = vt.get_view();
        assert!(!view.is_null());
    }

    #[test]
    fn test_cursor_position() {
        let mut vt = create(80, 24, 0);
        vt.feed("hi");
        let cursor = vt.get_cursor();
        assert!(!cursor.is_null());
    }

    #[test]
    fn test_get_size() {
        let vt = create(80, 24, 0);
        let size = vt.get_size();
        assert!(!size.is_null());
    }
}
