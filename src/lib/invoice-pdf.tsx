import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { EmiContract, EmiEarlySettlement, EmiInstallment, InvoiceItem, Sale } from '@/domain/types';
import { emiDisplayStatus } from '@/lib/emi-summary';
import { SHOP_LOGO_DATA_URI } from '@/lib/shop-branding';

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: 'Helvetica', fontSize: 9, color: '#14181d' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#14181d',
    paddingBottom: 6,
    marginBottom: 10,
  },
  logo: { width: 96, height: 64, objectFit: 'contain', objectPosition: 'left top', marginBottom: 3 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 24, lineHeight: 1, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  paymentBadge: {
    marginTop: 6,
    backgroundColor: '#f3f4f6',
    color: '#14181d',
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  voided: { color: '#b42318' },
  muted: { color: '#374151', fontSize: 8, marginTop: 2 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  metaBox: { width: '47%' },
  label: { color: '#374151', fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d5dade',
    paddingVertical: 7,
    paddingHorizontal: 7,
  },
  tableHead: { backgroundColor: '#e9ecee', fontFamily: 'Helvetica-Bold' },
  item: { width: '55%' },
  qty: { width: '10%', textAlign: 'right' },
  amount: { width: '17.5%', textAlign: 'right' },
  summary: { marginLeft: '55%', marginTop: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  total: { borderTopWidth: 1, paddingTop: 6, marginTop: 3, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  note: { marginTop: 18, color: '#374151', fontSize: 8 },
  tradeIn: { marginTop: 12, borderWidth: 0.5, borderColor: '#d5dade', padding: 8 },
  payment: { marginTop: 14, borderTopWidth: 0.5, borderTopColor: '#b8c0c8', paddingTop: 10 },
  paymentRow: { marginBottom: 7 },
  footer: { position: 'absolute', left: 34, right: 34, bottom: 24, color: '#374151', fontSize: 7 },
});

function money(value: number): string {
  return `BDT ${(value / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(new Date(value));
}

function dateOnly(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
  }).format(new Date(value));
}

function InvoiceDocument({
  sale,
  items,
  shop,
  emi,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: { name: string; address: string | null; phone: string | null; policy: string | null };
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null } | null;
}) {
  const rawEmiStatus = emi ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement) : null;
  const invoicePaymentStatus = rawEmiStatus
    ? rawEmiStatus === 'PAID' || rawEmiStatus === 'SETTLED_EARLY' ? 'PAID' : 'ACTIVE'
    : sale.paymentStatus;
  const paymentBadge = sale.status === 'VOIDED'
    ? null
    : rawEmiStatus
      ? `EMI / ${invoicePaymentStatus}`
      : invoicePaymentStatus === 'UNPAID'
        ? 'UNPAID'
        : `${sale.paymentMethod.replaceAll('_', ' ')} / ${invoicePaymentStatus}`;
  return (
    <Document title={sale.invoiceNumber} author={shop.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Image src={SHOP_LOGO_DATA_URI} style={styles.logo} />
            {shop.address && <Text style={styles.muted}>{shop.address}</Text>}
            {shop.phone && <Text style={styles.muted}>{shop.phone}</Text>}
          </View>
          <View style={styles.titleBox}>
            <Text style={[styles.title, sale.status === 'VOIDED' ? styles.voided : {}]}>
              {sale.status === 'VOIDED' ? 'VOIDED INVOICE' : 'INVOICE'}
            </Text>
            <Text style={styles.muted}>{sale.invoiceNumber}</Text>
            {paymentBadge && <Text style={styles.paymentBadge}>{paymentBadge}</Text>}
          </View>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaBox}>
            <Text style={styles.label}>Customer</Text>
            <Text>{sale.customerName ?? 'Walk-in customer'}</Text>
            {sale.customerPhone && <Text style={styles.muted}>{sale.customerPhone}</Text>}
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.label}>Date</Text>
            <Text>{dateTime(sale.completedAt)}</Text>
            <Text style={styles.muted}>Served by {sale.actorName}</Text>
            {sale.reference && <Text style={styles.muted}>Ref: {sale.reference}</Text>}
          </View>
        </View>
        <View style={[styles.row, styles.tableHead]}>
          <Text style={styles.item}>Item</Text><Text style={styles.qty}>Qty</Text><Text style={styles.amount}>Unit price</Text><Text style={styles.amount}>Total</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} style={styles.row} wrap={false}>
            <View style={styles.item}>
              <Text>{item.productName}</Text>
              <Text style={styles.muted}>Code (SKU) {item.sku}{item.serialNo ? ` / Device no. ${item.serialNo}` : ''}</Text>
              {item.usedGrade && <Text style={styles.muted}>Used phone / {item.usedGrade === 'REFURBISHED' ? 'Refurbished' : item.usedGrade.replace('GRADE_', 'Grade ')}</Text>}
              {item.knownDefects && <Text style={styles.muted}>Declared defects: {item.knownDefects}</Text>}
              {item.warrantyDays
                ? <Text style={styles.muted}>{item.warrantyDays} {item.warrantyDays === 1 ? 'day' : 'days'} warranty</Text>
                : item.warrantyMonths
                  ? <Text style={styles.muted}>{item.warrantyMonths} {item.warrantyMonths === 1 ? 'month' : 'months'} warranty</Text>
                  : null}
            </View>
            <Text style={styles.qty}>{item.quantity}</Text>
            <Text style={styles.amount}>{money(item.actualUnitPrice)}</Text>
            <Text style={styles.amount}>{money(item.lineTotal)}</Text>
          </View>
        ))}
        {sale.tradeInDetails && (
          <View style={styles.tradeIn} wrap={false}>
            <Text style={styles.label}>Trade-in device</Text>
            <Text>{sale.tradeInDetails.productName}</Text>
            <Text style={styles.muted}>Code (SKU) {sale.tradeInDetails.sku} / Device no. {sale.tradeInDetails.serialNo}</Text>
            <Text style={styles.muted}>{sale.tradeInDetails.grade === 'REFURBISHED' ? 'Refurbished' : sale.tradeInDetails.grade.replace('GRADE_', 'Grade ')} / Credit {money(sale.tradeInDetails.acquisitionValue)}</Text>
          </View>
        )}
        <View style={styles.summary}>
          <View style={[styles.summaryRow, styles.total]}><Text>Total</Text><Text>{money(sale.total)}</Text></View>
          {sale.tradeInCredit > 0 && (
            <>
              <View style={styles.summaryRow}><Text>Trade-in credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>
              <View style={[styles.summaryRow, styles.total]}><Text>Amount due</Text><Text>{money(sale.total - sale.tradeInCredit)}</Text></View>
            </>
          )}
        </View>
        {emi && (
          <View style={styles.tradeIn} wrap={false}>
            <Text style={styles.label}>Installment schedule</Text>
            <Text style={styles.muted}>
              {emi.installments
                .map((row) => `#${row.sequence} ${new Date(row.dueDate).toLocaleDateString('en-GB')} ${money(row.amountDue)}`)
                .join(' · ')}
            </Text>
          </View>
        )}
        {(emi || sale.note || sale.status === 'VOIDED') && <View style={styles.payment}>
          {emi ? (
            <>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>Payment plan</Text>
                <Text>Shop-managed EMI</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>Contract</Text>
                <Text>{emi.contract.contractNumber} · {emi.contract.termMonths} monthly installments</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>Down payment</Text>
                <Text>{money(emi.contract.downPayment)} via {sale.paymentMethod.replaceAll('_', ' ')}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>Financed balance</Text>
                <Text>{money(emi.contract.financedAmount)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.label}>First installment date</Text>
                <Text>{dateOnly(emi.contract.firstDueDate)}</Text>
              </View>
            </>
          ) : null}
          {sale.note && (
            <View style={styles.paymentRow}>
              <Text style={styles.label}>Note</Text>
              <Text>{sale.note}</Text>
            </View>
          )}
          {sale.status === 'VOIDED' && (
            <View style={styles.paymentRow}>
              <Text style={[styles.label, styles.voided]}>Voided</Text>
              <Text style={styles.voided}>
                {sale.voidedAt ? dateTime(sale.voidedAt) : 'Recorded'}
                {sale.voidedByName ? ` by ${sale.voidedByName}` : ''}. Reason: {sale.voidReason ?? 'Not recorded'}.
                {' '}Refund: {money(sale.refundAmount ?? 0)}{sale.refundMethod ? ` via ${sale.refundMethod.replaceAll('_', ' ')}` : ''}.
              </Text>
            </View>
          )}
        </View>}
        {shop.policy && (
          <View style={styles.footer}>
            <Text>{shop.policy}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function invoiceToPdf(
  sale: Sale,
  items: InvoiceItem[],
  shop: { name: string; address: string | null; phone: string | null; policy: string | null },
  emi: { contract: EmiContract; installments: EmiInstallment[]; earlySettlement: EmiEarlySettlement | null } | null = null,
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument sale={sale} items={items} shop={shop} emi={emi} />);
}
