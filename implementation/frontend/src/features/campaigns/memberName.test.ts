import { describe, expect, it } from 'vitest'
import { memberHandle, memberName } from './memberName'

describe('memberName', () => {
  it('prefers the display name, then the username, then a neutral phrase', () => {
    expect(memberName({ username: 'player_two', display_name: 'Aria' })).toBe('Aria')
    expect(memberName({ username: 'player_two', display_name: null })).toBe('player_two')
    expect(memberName({ username: 'player_two' })).toBe('player_two')
    expect(memberName({ username: null, display_name: '' })).toBe('this player')
  })
})

describe('memberHandle', () => {
  it('shows the username only beside a different display name', () => {
    expect(memberHandle({ username: 'player_two', display_name: 'Aria' })).toBe('player_two')
    expect(memberHandle({ username: 'player_two', display_name: 'player_two' })).toBeNull()
    expect(memberHandle({ username: 'player_two', display_name: null })).toBeNull()
    expect(memberHandle({ username: null, display_name: 'Aria' })).toBeNull()
  })
})
