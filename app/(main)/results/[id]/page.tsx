import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import ResultDisplay from '@/components/ResultDisplay/ResultDisplay'
import UpgradeModal from '@/components/UpgradeModal/UpgradeModal'
import { Generation } from '@/types'
import styles from './page.module.css'

interface PageProps {
  params: {
    id: string
  }
}

export default async function ResultsPage({ params }: PageProps) {
  const supabase = getServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  // Get generation
  const { data: generation, error } = await supabase
    .from('generations')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (error || !generation) {
    notFound()
  }

  // Get user plan
  const { data: userData } = await supabase
    .from('users')
    .select('plan, generations_used')
    .eq('id', user.id)
    .single()

  const plan = userData?.plan || 'free'
  const isBlurred = plan === 'free' && userData?.generations_used >= 1

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>생성 결과</h1>
        <a href="/" className={styles.backLink}>
          ← 새로 생성하기
        </a>
      </header>

      <main className={styles.main}>
        <ResultDisplay
          result={(generation as Generation).result_json}
          plan={plan}
          isBlurred={isBlurred}
        />
        {isBlurred && (
          <div className={styles.upgradePrompt}>
            <p>결과를 보려면 PRO로 업그레이드하세요.</p>
            <a href="/upgrade" className={styles.upgradeButton}>
              업그레이드
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
