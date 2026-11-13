import '@testing-library/jest-dom/vitest'

// jsdom implements neither the modal <dialog> API nor checkVisibility().
// These minimal versions cover what the camp's focus handling relies on.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

function isVisible(element: Element, checkVisibilityCSS: boolean) {
  if (checkVisibilityCSS && getComputedStyle(element).visibility === 'hidden') return false
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false
    if (node instanceof HTMLDialogElement && !node.open) return false
    if (getComputedStyle(node).display === 'none') return false
  }
  return true
}

Element.prototype.checkVisibility ??= function checkVisibility(
  this: Element,
  options?: CheckVisibilityOptions,
) {
  return isVisible(this, Boolean(options?.checkVisibilityCSS))
}
