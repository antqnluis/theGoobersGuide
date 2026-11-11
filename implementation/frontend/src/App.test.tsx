import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('development setup screen', () => {
  it('renders the application status checks', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: "The Goober's Guide" })).toBeInTheDocument()
    expect(screen.getByText('Application initialized and rendering.')).toBeInTheDocument()
    expect(screen.getByText('Utility styles are loaded through Vite.')).toBeInTheDocument()
    expect(screen.getByText('Local Supabase')).toBeInTheDocument()
  })
})
