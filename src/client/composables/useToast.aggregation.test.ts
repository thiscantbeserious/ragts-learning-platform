/**
 * Aggregation tests for useToast composable.
 *
 * Covers: category-based aggregation, titled toasts as display-only,
 * titleless/uncategorized toasts bypass aggregation, cleanup after dismiss,
 * updateToast fallback when toast disappears mid-burst.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useToast, resetToastState, ToastCategory } from './useToast.js';

describe('useToast aggregation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetToastState();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetToastState();
  });

  describe('category-based aggregation', () => {
    it('first toast with a category is created normally and returns an ID', () => {
      const { toasts, fireToast } = useToast();
      const id = fireToast('File uploaded', 'success', {
        title: 'Session uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      expect(toasts.value).toHaveLength(1);
      expect(typeof id).toBe('number');
    });

    it('second toast with same category updates existing toast in place (count=2)', () => {
      const { toasts, fireToast } = useToast();
      fireToast('file1.cast uploaded', 'success', {
        title: 'Session uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
        itemLabel: 'file1.cast',
        summaryTemplate: (count) => `${count} sessions uploaded`,
      });
      fireToast('file2.cast uploaded', 'success', {
        title: 'Session uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
        itemLabel: 'file2.cast',
        summaryTemplate: (count) => `${count} sessions uploaded`,
      });
      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('2 sessions uploaded');
    });

    it('returns the same ID for subsequent toasts of same category', () => {
      const { fireToast } = useToast();
      const id1 = fireToast('file1.cast', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      const id2 = fireToast('file2.cast', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      expect(id1).toBe(id2);
    });

    it('third toast with same category updates to count=3', () => {
      const { toasts, fireToast } = useToast();
      const template = (count: number) => `${count} sessions uploaded`;
      fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS, summaryTemplate: template });
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS, summaryTemplate: template });
      fireToast('f3', 'success', { category: ToastCategory.UPLOAD_SUCCESS, summaryTemplate: template });
      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('3 sessions uploaded');
    });

    it('two toasts with different categories are NOT merged', () => {
      const { toasts, fireToast } = useToast();
      fireToast('upload ok', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      fireToast('session ready', 'success', { category: ToastCategory.SESSION_READY });
      expect(toasts.value).toHaveLength(2);
    });

    it('toast with category but no title still participates in aggregation', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value).toHaveLength(1);
    });

    it('toast without category bypasses aggregation (backward compat)', () => {
      const { toasts, fireToast } = useToast();
      fireToast('First', 'success', { title: 'Same title' });
      fireToast('Second', 'success', { title: 'Same title' });
      expect(toasts.value).toHaveLength(2);
    });
  });

  describe('title is purely display', () => {
    it('two toasts with same category but different titles are MERGED', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', {
        title: 'Session uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      fireToast('f2', 'success', {
        title: 'Sessions uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      expect(toasts.value).toHaveLength(1);
    });

    it('original toast title is preserved on aggregation update', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', {
        title: 'Session uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      fireToast('f2', 'success', {
        title: 'Sessions uploaded',
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      expect(toasts.value[0]?.title).toBe('Session uploaded');
    });
  });

  describe('updateToast can change title', () => {
    it('updateToast with title field changes the title', () => {
      const { toasts, fireToast, updateToast } = useToast();
      const id = fireToast('msg', 'success', {
        title: 'Original title',
        category: ToastCategory.UPLOAD_SUCCESS,
      });
      updateToast(id, { title: 'New Title' });
      expect(toasts.value[0]?.title).toBe('New Title');
    });

    it('title change via updateToast does not break aggregation', () => {
      const { toasts, fireToast, updateToast } = useToast();
      const id = fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      updateToast(id, { title: 'New Title' });
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value).toHaveLength(1);
    });
  });

  describe('summaryTemplate and built-in formatting', () => {
    it('summaryTemplate receives (count, itemLabels, messages)', () => {
      const { fireToast } = useToast();
      const captured: { count: number; labels: string[]; messages: string[] }[] = [];
      const template = (count: number, labels: string[], messages: string[]) => {
        captured.push({ count, labels, messages });
        return `${count} items`;
      };
      fireToast('msg1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        itemLabel: 'a.cast',
        summaryTemplate: template,
      });
      fireToast('msg2', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        itemLabel: 'b.cast',
        summaryTemplate: template,
      });

      expect(captured).toHaveLength(1);
      expect(captured[0]?.count).toBe(2);
      expect(captured[0]?.labels).toEqual(['a.cast', 'b.cast']);
      expect(captured[0]?.messages).toEqual(['msg1', 'msg2']);
    });

    it('uses default "{N} notifications" summary when no summaryTemplate provided', () => {
      const { toasts, fireToast } = useToast();
      fireToast('First', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      fireToast('Second', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value[0]?.message).toBe('2 notifications');
    });

    it('summaryNoun produces "{N} {noun}" on aggregation', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryNoun: 'sessions uploaded',
      });
      fireToast('f2', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryNoun: 'sessions uploaded',
      });
      expect(toasts.value[0]?.message).toBe('2 sessions uploaded');
    });

    it('showItemLabels appends truncated label list', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'error', {
        category: ToastCategory.UPLOAD_FAILED,
        summaryNoun: 'failed',
        showItemLabels: true,
        itemLabel: 'a.cast',
      });
      fireToast('f2', 'error', {
        category: ToastCategory.UPLOAD_FAILED,
        summaryNoun: 'failed',
        showItemLabels: true,
        itemLabel: 'b.cast',
      });
      expect(toasts.value[0]?.message).toBe('2 failed: a.cast, b.cast');
    });

    it('showItemLabels truncates at 3 labels with "and N more"', () => {
      const { toasts, fireToast } = useToast();
      const opts = {
        category: ToastCategory.UPLOAD_FAILED,
        summaryNoun: 'failed',
        showItemLabels: true,
      };
      fireToast('f1', 'error', { ...opts, itemLabel: 'a.cast' });
      fireToast('f2', 'error', { ...opts, itemLabel: 'b.cast' });
      fireToast('f3', 'error', { ...opts, itemLabel: 'c.cast' });
      fireToast('f4', 'error', { ...opts, itemLabel: 'd.cast' });
      fireToast('f5', 'error', { ...opts, itemLabel: 'e.cast' });
      expect(toasts.value[0]?.message).toBe('5 failed: a.cast, b.cast, c.cast and 2 more');
    });

    it('showItemLabels with exactly 3 labels shows all without "and N more"', () => {
      const { toasts, fireToast } = useToast();
      const opts = {
        category: ToastCategory.UPLOAD_FAILED,
        summaryNoun: 'failed',
        showItemLabels: true,
      };
      fireToast('f1', 'error', { ...opts, itemLabel: 'a.cast' });
      fireToast('f2', 'error', { ...opts, itemLabel: 'b.cast' });
      fireToast('f3', 'error', { ...opts, itemLabel: 'c.cast' });
      expect(toasts.value[0]?.message).toBe('3 failed: a.cast, b.cast, c.cast');
    });

    it('showItemLabels with no itemLabel values omits the label suffix', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'error', {
        category: ToastCategory.UPLOAD_FAILED,
        summaryNoun: 'failed',
        showItemLabels: true,
      });
      fireToast('f2', 'error', {
        category: ToastCategory.UPLOAD_FAILED,
        summaryNoun: 'failed',
        showItemLabels: true,
      });
      expect(toasts.value[0]?.message).toBe('2 failed');
    });

    it('summaryNoun without showItemLabels does not append labels', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryNoun: 'uploaded',
        itemLabel: 'a.cast',
      });
      fireToast('f2', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryNoun: 'uploaded',
        itemLabel: 'b.cast',
      });
      expect(toasts.value[0]?.message).toBe('2 uploaded');
    });

    it('summaryTemplate overrides summaryNoun when both provided', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryNoun: 'uploaded',
        summaryTemplate: (n) => `custom: ${n}`,
      });
      fireToast('f2', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryNoun: 'uploaded',
        summaryTemplate: (n) => `custom: ${n}`,
      });
      expect(toasts.value[0]?.message).toBe('custom: 2');
    });

    it('collects itemLabel values and passes them to summaryTemplate', () => {
      const { toasts, fireToast } = useToast();
      fireToast('msg1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        itemLabel: 'a.cast',
        summaryTemplate: (_, labels) => labels.join(', '),
      });
      fireToast('msg2', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        itemLabel: 'b.cast',
        summaryTemplate: (_, labels) => labels.join(', '),
      });
      expect(toasts.value[0]?.message).toBe('a.cast, b.cast');
    });

    it('collects original messages and passes them to summaryTemplate', () => {
      const { toasts, fireToast } = useToast();
      fireToast('msg1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryTemplate: (_, _labels, messages) => messages.join(' | '),
      });
      fireToast('msg2', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        summaryTemplate: (_, _labels, messages) => messages.join(' | '),
      });
      expect(toasts.value[0]?.message).toBe('msg1 | msg2');
    });

    it('preserves the original toast icon on aggregation update', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', {
        category: ToastCategory.UPLOAD_SUCCESS,
        icon: 'icon-file',
      });
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value[0]?.icon).toBe('icon-file');
    });
  });

  describe('cleanup', () => {
    it('dismissed toast clears activeKeys; next toast of same kind starts fresh', async () => {
      const { toasts, fireToast, removeToast } = useToast();

      const id = fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value).toHaveLength(1);

      removeToast(id);
      expect(toasts.value).toHaveLength(0);

      await nextTick();

      fireToast('f3', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('f3');
    });

    it('auto-dismissed toast clears activeKeys; next toast starts fresh', async () => {
      const { toasts, fireToast } = useToast();

      fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS }); // 5000ms default
      vi.advanceTimersByTime(5001);
      expect(toasts.value).toHaveLength(0);

      await nextTick();

      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('f2');
    });

    it('gracefully handles updateToast returning false mid-burst by creating a fresh toast', async () => {
      const { toasts, fireToast, removeToast } = useToast();

      const id = fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS });

      // Forcibly remove the toast WITHOUT going through aggregation cleanup
      removeToast(id);

      // nextTick NOT called yet — activeKeys still has stale entry
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });

      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('f2');
    });

    it('resetToastState clears activeKeys; next categorized toast starts fresh', () => {
      const { toasts, fireToast } = useToast();
      fireToast('f1', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      fireToast('f2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value[0]?.message).toBe('2 notifications');

      resetToastState();

      fireToast('f3', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('f3');
    });
  });

  describe('toasts without category bypass aggregation', () => {
    it('toast without category is created normally with no aggregation', () => {
      const { toasts, fireToast } = useToast();
      fireToast('No category here', 'success');
      expect(toasts.value).toHaveLength(1);
      expect(toasts.value[0]?.message).toBe('No category here');
    });

    it('multiple toasts without category each create separate toasts', () => {
      const { toasts, fireToast } = useToast();
      fireToast('First', 'success');
      fireToast('Second', 'success');
      expect(toasts.value).toHaveLength(2);
    });

    it('toasts with title but no category bypass aggregation', () => {
      const { toasts, fireToast } = useToast();
      fireToast('First', 'success', { title: 'Same title' });
      fireToast('Second', 'success', { title: 'Same title' });
      expect(toasts.value).toHaveLength(2);
    });

    it('uncategorized toasts do not interfere with categorized toasts of same type', () => {
      const { toasts, fireToast } = useToast();
      fireToast('Uncategorized', 'success');
      fireToast('Cat 1', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      fireToast('Cat 2', 'success', { category: ToastCategory.UPLOAD_SUCCESS });
      // Uncategorized = 1 toast, categorized = 1 aggregated toast
      expect(toasts.value).toHaveLength(2);
    });
  });
});
