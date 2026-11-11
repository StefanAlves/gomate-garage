import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components/Tabs'
import { css } from 'styled-system/css'

const list = css({
  display: 'flex',
  gap: '1',
  overflowX: 'auto',
  borderBottom: '1px solid token(colors.border)',
  scrollbarWidth: 'none',
})

const tab = css({
  px: '3',
  py: '2',
  fontSize: 'sm',
  fontWeight: 'medium',
  color: 'muted.foreground',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  outline: 'none',
  borderBottom: '2px solid transparent',
  mb: '-1px',
  _hovered: { color: 'foreground' },
  _selected: { color: 'foreground', borderBottomColor: 'primary' },
  _focusVisible: { boxShadow: '0 0 0 2px token(colors.ring)', borderRadius: 'sm' },
})

const count = css({ ml: '1.5', color: 'muted.foreground', fontWeight: 'normal' })

const panel = css({ pt: '4', outline: 'none' })

export interface TabDef<K extends string> {
  id: K
  label: string
  count?: number
}

/**
 * Detail-page tabs. The selected tab lives in the URL (`?tab=`), so it
 * survives reloads and can be linked to; the caller owns that state.
 */
export function DetailTabs<K extends string>({
  tabs,
  selected,
  onChange,
  render,
}: {
  tabs: TabDef<K>[]
  selected: K
  onChange: (key: K) => void
  render: (key: K) => React.ReactNode
}) {
  return (
    <Tabs selectedKey={selected} onSelectionChange={(k) => onChange(k as K)}>
      <TabList aria-label="Sections" className={list}>
        {tabs.map((t) => (
          <Tab key={t.id} id={t.id} className={tab}>
            {t.label}
            {t.count !== undefined && <span className={count}>({t.count})</span>}
          </Tab>
        ))}
      </TabList>
      {tabs.map((t) => (
        <TabPanel key={t.id} id={t.id} className={panel}>
          {render(t.id)}
        </TabPanel>
      ))}
    </Tabs>
  )
}

/** Placeholder for a tab whose module isn't built yet. */
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel stack">
      <div className="row between wrap">
        <h2>{title}</h2>
        <span className="badge muted">Coming soon</span>
      </div>
      <p className="muted">{children}</p>
    </section>
  )
}
