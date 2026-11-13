/** Shared trial-balance loader hook. */
import { useEffect, useState } from 'react'
import { loadTrialBalance, type TrialBalance } from './core.ts'

export interface TrialBalanceState {
  data: TrialBalance | null
  error: string | null
  loading: boolean
  reload: () => void
}

/** Load the chart of accounts once, exposing loading and error state. */
export function useTrialBalance(): TrialBalanceState {
  const [data, setData] = useState<TrialBalance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    loadTrialBalance()
      .then((next) => {
        if (alive) setData(next)
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [generation])

  return {
    data,
    error,
    loading,
    reload: () => {
      setGeneration(value => value + 1)
    },
  }
}
