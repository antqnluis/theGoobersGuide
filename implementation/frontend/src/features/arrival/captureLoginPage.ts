import type { LoginSnapshot } from './arrivalContext'

const maskedAutocomplete = /password/

/**
 * Copies the login page for the arrival to leave from. The page itself
 * unmounts the moment the session is accepted. The copy is inert, carries no
 * form or password field for a password manager to mistake, and shows a
 * password as dots of the same length, never as typed.
 */
export function captureLoginPage(): LoginSnapshot | null {
  const page = document.querySelector<HTMLElement>('.auth-page')
  if (!page) return null

  const copy = page.cloneNode(true) as HTMLElement
  const sources = page.querySelectorAll('input')
  copy.querySelectorAll('input').forEach((input, index) => {
    const source = sources[index]
    const masked = maskedAutocomplete.test(source.autocomplete)
    const value = masked ? '•'.repeat(Math.min(source.value.length, 32)) : source.value
    input.type = 'text'
    input.removeAttribute('name')
    input.autocomplete = 'off'
    input.readOnly = true
    input.tabIndex = -1
    input.setAttribute('value', value)
    input.value = value
  })
  copy.querySelectorAll('form').forEach((form) => {
    const stand = document.createElement('div')
    stand.className = form.className
    stand.append(...form.childNodes)
    form.replaceWith(stand)
  })
  copy
    .querySelectorAll('[id], [for], [aria-labelledby], [aria-describedby], [aria-controls]')
    .forEach((element) => {
      for (const name of ['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
        element.removeAttribute(name)
      }
    })
  copy.classList.add('arrival-snapshot')
  copy.setAttribute('inert', '')
  copy.setAttribute('aria-hidden', 'true')

  return {
    node: copy,
    scrollY: window.scrollY,
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  }
}
