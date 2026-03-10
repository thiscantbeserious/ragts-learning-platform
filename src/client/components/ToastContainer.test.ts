/**
 * Unit tests for ToastContainer component.
 * Exercises the design system BEM structure, icon mapping, title/message rendering,
 * type modifier classes, and dismiss interaction.
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToastContainer from './ToastContainer.vue';
import type { Toast } from '../composables/useToast';

function makeToast(overrides: Partial<Toast> = {}): Toast {
  return { id: 1, message: 'Test message', type: 'info', ...overrides };
}

function mountContainer(toasts: Toast[]) {
  return mount(ToastContainer, {
    props: { toasts },
    global: {},
  });
}

describe('ToastContainer — structure', () => {
  it('renders .toast-stack as container', () => {
    const wrapper = mountContainer([makeToast()]);
    expect(wrapper.find('.toast-stack').exists()).toBe(true);
  });

  it('renders .toast__icon element', () => {
    const wrapper = mountContainer([makeToast()]);
    expect(wrapper.find('.toast__icon').exists()).toBe(true);
  });

  it('renders .toast__content element', () => {
    const wrapper = mountContainer([makeToast()]);
    expect(wrapper.find('.toast__content').exists()).toBe(true);
  });

  it('renders .toast__close button', () => {
    const wrapper = mountContainer([makeToast()]);
    expect(wrapper.find('.toast__close').exists()).toBe(true);
  });

  it('renders .toast__message with message text', () => {
    const wrapper = mountContainer([makeToast({ message: 'Hello world' })]);
    expect(wrapper.find('.toast__message').text()).toBe('Hello world');
  });
});

describe('ToastContainer — type modifier classes', () => {
  it('applies .toast--success for success type', () => {
    const wrapper = mountContainer([makeToast({ type: 'success' })]);
    expect(wrapper.find('.toast--success').exists()).toBe(true);
  });

  it('applies .toast--error for error type', () => {
    const wrapper = mountContainer([makeToast({ type: 'error' })]);
    expect(wrapper.find('.toast--error').exists()).toBe(true);
  });

  it('applies .toast--info for info type', () => {
    const wrapper = mountContainer([makeToast({ type: 'info' })]);
    expect(wrapper.find('.toast--info').exists()).toBe(true);
  });
});

describe('ToastContainer — icon mapping', () => {
  it('renders icon-check-circle for success type', () => {
    const wrapper = mountContainer([makeToast({ type: 'success' })]);
    expect(wrapper.find('.toast__icon .icon-check-circle').exists()).toBe(true);
  });

  it('renders icon-error-circle for error type', () => {
    const wrapper = mountContainer([makeToast({ type: 'error' })]);
    expect(wrapper.find('.toast__icon .icon-error-circle').exists()).toBe(true);
  });

  it('renders icon-info for info type', () => {
    const wrapper = mountContainer([makeToast({ type: 'info' })]);
    expect(wrapper.find('.toast__icon .icon-info').exists()).toBe(true);
  });

  it('icon span has icon--md class', () => {
    const wrapper = mountContainer([makeToast({ type: 'success' })]);
    expect(wrapper.find('.toast__icon .icon--md').exists()).toBe(true);
  });
});

describe('ToastContainer — title', () => {
  it('renders .toast__title when title is provided', () => {
    const wrapper = mountContainer([makeToast({ title: 'Upload complete' })]);
    expect(wrapper.find('.toast__title').exists()).toBe(true);
    expect(wrapper.find('.toast__title').text()).toBe('Upload complete');
  });

  it('does not render .toast__title when title is absent', () => {
    const wrapper = mountContainer([makeToast()]);
    expect(wrapper.find('.toast__title').exists()).toBe(false);
  });
});

describe('ToastContainer — dismiss interaction', () => {
  it('emits dismiss with toast id when close button is clicked', async () => {
    const toast = makeToast({ id: 42 });
    const wrapper = mountContainer([toast]);
    await wrapper.find('.toast__close').trigger('click');
    const emitted = wrapper.emitted('dismiss') as number[][];
    expect(emitted).toBeDefined();
    expect(emitted[0]).toEqual([42]);
  });
});
