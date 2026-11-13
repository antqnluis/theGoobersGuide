import { useContext } from 'react'
import { ArrivalContext } from './arrivalContext'

export function useArrival() {
  return useContext(ArrivalContext)
}
