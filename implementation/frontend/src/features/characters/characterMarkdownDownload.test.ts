import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadMarkdown, markdownFilename } from './characterMarkdownDownload'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('markdownFilename', () => {
  it.each([
    ['Arlen Vale', 'arlen-vale.md'],
    ['  Zoë  the   Great!! ', 'zoe-the-great.md'],
    ['../../etc/passwd', 'etc-passwd.md'],
    ['火', 'character.md'],
    ['', 'character.md'],
    ['x'.repeat(100), `${'x'.repeat(60)}.md`],
  ])('names %j as %s', (name, expected) => {
    expect(markdownFilename(name)).toBe(expected)
  })
})

describe('downloadMarkdown', () => {
  it('downloads the text as a Markdown file and cleans up', async () => {
    vi.useFakeTimers()
    const create = vi.fn().mockReturnValue('blob:one')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadMarkdown('arlen.md', '# Arlen\n')

    const blob = create.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    expect(await blob.text()).toBe('# Arlen\n')
    const clicked = click.mock.contexts[0] as HTMLAnchorElement
    expect(clicked.download).toBe('arlen.md')
    expect(clicked.getAttribute('href')).toBe('blob:one')
    expect(document.querySelector('a[download]')).toBeNull()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:one')
  })
})
