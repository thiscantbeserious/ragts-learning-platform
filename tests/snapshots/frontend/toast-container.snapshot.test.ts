/**
 * Snapshot tests for ToastContainer component.
 * Locks down HTML for success, error, and info toast types.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToastContainer from '@client/components/ToastContainer.vue';
import type { Toast } from '@client/composables/useToast';

describe('ToastContainer component snapshots', () => {
  it('success toast', () => {
    const toasts: Toast[] = [
      { id: 1, message: 'Session uploaded successfully', type: 'success' },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('error toast', () => {
    const toasts: Toast[] = [
      { id: 2, message: 'Upload failed: invalid file type', type: 'error' },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('info toast', () => {
    const toasts: Toast[] = [
      { id: 3, message: 'Processing session...', type: 'info' },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('multiple toasts stacked', () => {
    const toasts: Toast[] = [
      { id: 1, message: 'Upload complete', type: 'success' },
      { id: 2, message: 'Another warning', type: 'error' },
      { id: 3, message: 'FYI', type: 'info' },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
