/**
 * Snapshot tests for UploadZone component.
 * Locks down HTML for default, dragging, uploading, and error states.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UploadZone from '@client/components/UploadZone.vue';

describe('UploadZone component snapshots', () => {
  it('default state', () => {
    const wrapper = mount(UploadZone, {
      props: { uploading: false, error: null, isDragging: false },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('dragging state', () => {
    const wrapper = mount(UploadZone, {
      props: { uploading: false, error: null, isDragging: true },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('uploading state', () => {
    const wrapper = mount(UploadZone, {
      props: { uploading: true, error: null, isDragging: false },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('error state', () => {
    const wrapper = mount(UploadZone, {
      props: { uploading: false, error: 'Only .cast files are supported', isDragging: false },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
