import Link from 'next/link'
import { Building2, User } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { PriorityChip, StatusChip } from '@/components/shared/status-chip'
import { projectFinance } from '@/lib/derive'
import { formatDate, formatMoney } from '@/lib/format'
import type { Payment, Project } from '@/lib/types'

export function ProjectTable({
  projects,
  payments,
  clientName,
}: {
  projects: Project[]
  payments: Payment[]
  clientName: (id: string | null) => string
}) {
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proyecto</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Avance</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead className="text-right">Cotizado</TableHead>
            <TableHead className="text-right">Cobrado</TableHead>
            <TableHead className="text-right">Pendiente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => {
            const fin = projectFinance(p, payments)
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/proyectos/${p.id}`}
                    className="flex items-center gap-2 font-medium transition-colors hover:text-neon-green"
                  >
                    {p.type === 'propio' ? (
                      <Building2 className="size-3.5 shrink-0 text-neon-violet" />
                    ) : (
                      <User className="size-3.5 shrink-0 text-neon-blue" />
                    )}
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {clientName(p.clientId)}
                </TableCell>
                <TableCell>
                  <StatusChip status={p.status} />
                </TableCell>
                <TableCell>
                  <PriorityChip priority={p.priority} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={p.development.progress}
                      className="h-1.5 w-16"
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.development.progress}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(p.estimatedDelivery)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(fin.quoted, p.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-neon-green">
                  {formatMoney(fin.collected, p.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(fin.pending, p.currency)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
