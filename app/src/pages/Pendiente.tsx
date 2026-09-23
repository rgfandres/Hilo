import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/layout/AppShell'
import type { Vocab } from '@/lib/vocab'

/** Página aún no construida. `titulo` puede ser texto fijo o una clave de vocabulario. */
export function Pendiente({ titulo, vocabKey, fase }: { titulo?: string; vocabKey?: keyof Vocab; fase: string }) {
  const { vocab } = useAuth()
  return (
    <>
      <PageHeader title={vocabKey ? vocab[vocabKey] : titulo} />
      <div className="p-8 text-fg-3">Pendiente ({fase}).</div>
    </>
  )
}
