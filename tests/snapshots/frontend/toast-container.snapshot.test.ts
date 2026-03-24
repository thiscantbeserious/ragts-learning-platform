/**
 * Snapshot tests for ToastContainer component.
 * Locks down HTML for success, error, info, and warning toast types.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToastContainer from '@client/components/ToastContainer.vue';
import type { Toast } from '@client/composables/useToast';

describe('ToastContainer component snapshots', () => {
  it('success toast', () => {
    const toasts: Toast[] = [
      {
        id: 1,
        title: 'Session uploaded',
        message: 'Session uploaded successfully',
        type: 'success',
        role: 'status',
      },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('error toast', () => {
    const toasts: Toast[] = [
      {
        id: 2,
        title: 'Upload failed',
        message: 'Upload failed: invalid file type',
        type: 'error',
        role: 'alert',
      },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('info toast', () => {
    const toasts: Toast[] = [
      { id: 3, message: 'Processing session...', type: 'info', role: 'status' },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('warning toast', () => {
    const toasts: Toast[] = [
      {
        id: 4,
        title: 'Large file detected',
        message: 'Processing may take longer than usual for files over 10MB.',
        type: 'warning',
        role: 'status',
      },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('multiple toasts stacked', () => {
    const toasts: Toast[] = [
      {
        id: 1,
        title: 'Session ready',
        message: 'Upload complete',
        type: 'success',
        role: 'status',
      },
      { id: 2, title: 'Upload failed', message: 'Another warning', type: 'error', role: 'alert' },
      { id: 3, message: 'FYI', type: 'info', role: 'status' },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('success toast with custom design-system icon', () => {
    const toasts: Toast[] = [
      {
        id: 5,
        title: 'Session ready',
        message: 'file.cast is ready',
        type: 'success',
        role: 'status',
        icon: 'icon-file-check',
      },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('error toast with custom design-system icon', () => {
    const toasts: Toast[] = [
      {
        id: 6,
        title: 'Upload failed',
        message: 'Could not upload file',
        type: 'error',
        role: 'alert',
        icon: 'icon-error-circle',
      },
    ];
    const wrapper = mount(ToastContainer, {
      props: { toasts },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
