
import { saleOccurredAt } from '@/lib/sale-timing';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { cosmeticSummary } from '@/lib/cosmetic-condition';
import type { EmiInstallment, InvoiceItem, Sale, SaleSettlement } from '@/domain/types';
import { emiInvoiceSummary, emiScheduleRows, emiScheduleDate, type EmiInvoiceData } from '@/lib/emi-presentation';
import { emiDisplayStatus } from '@/lib/emi-summary';
import { regularInvoiceAmountDue } from '@/lib/invoice-payment-status';

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
  logo: { width: 120, height: 68, objectFit: 'contain', objectPosition: 'left top', marginBottom: 3 },
  shopName: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
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

const thermalStyles = StyleSheet.create({
  page: { paddingTop: 9, paddingBottom: 7, fontFamily: 'Helvetica', fontSize: 7.2, color: '#000000' },
  page58: { paddingHorizontal: 5 },
  page80: { paddingHorizontal: 6 },
  logo: { objectFit: 'contain', objectPosition: 'center', alignSelf: 'center' },
  logo58: { width: 110, height: 61 },
  logo80: { width: 140, height: 77 },
  shopName: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  title: { marginTop: 3, fontSize: 11.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  centered: { textAlign: 'center' },
  muted: { color: '#000000', fontSize: 6.3, marginTop: 1.2 },
  badge: { alignSelf: 'center', marginTop: 4, paddingVertical: 2, paddingHorizontal: 5, borderWidth: 0.5, borderColor: '#c7cdd3', color: '#000000', fontFamily: 'Helvetica-Bold', fontSize: 7 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: '#d5dade', marginVertical: 7 },
  label: { color: '#000000', fontSize: 6, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 1 },
  section: { marginBottom: 1 },
  metaRow: { flexDirection: 'row', columnGap: 8 },
  metaColumn: { width: '50%' },
  metaDate58: { marginTop: 4 },
  servedBy: { alignItems: 'flex-end', marginTop: 4 },
  servedByLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, textTransform: 'uppercase' },
  servedByName: { fontSize: 6.3, marginTop: 1.2 },
  headerDivider: { marginTop: 3 },
  itemHeader: { flexDirection: 'row', backgroundColor: '#e9ecee', color: '#000000', borderBottomWidth: 0.5, borderBottomColor: '#d5dade', paddingVertical: 3, paddingHorizontal: 2, fontFamily: 'Helvetica-Bold', fontSize: 6.2 },
  itemHeaderName: { width: '67%' },
  itemHeaderQty: { width: '10%', textAlign: 'right' },
  itemHeaderTotal: { width: '23%', textAlign: 'right' },
  item: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d5dade', paddingVertical: 5, paddingHorizontal: 2 },
  itemBody: { width: '67%', paddingRight: 2 },
  itemQty: { width: '10%', textAlign: 'right' },
  itemTotal: { width: '23%', textAlign: 'right' },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 7.6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  summary: { marginTop: 7 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.7, borderTopColor: '#000000', paddingTop: 5, marginTop: 5, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  box: { borderWidth: 0.35, borderColor: '#d5dade', padding: 5, marginTop: 5 },
  voided: { color: '#000000' },
});

const MM_TO_PT = 72 / 25.4;

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

function wrappedLines(value: string | null | undefined, characters: number): number {
  if (!value) return 0;
  return value.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / characters)), 0);
}

function recoveredTradeInPayout(settlements: SaleSettlement[]): number {
  return settlements
    .filter((entry) => entry.type === 'TRADE_IN_PAYOUT_RECOVERY')
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function thermalInvoiceHeightMm(sale: Sale, items: InvoiceItem[], emi: { installments: EmiInstallment[] } | null, widthMm: 58 | 80): number {
  // React PDF will create another logical page when the content is even a few
  // points taller than this value. Keep a deliberate safety allowance so a
  // receipt remains one continuous roll page instead of moving its totals to a
  // second sheet. The narrower layout also wraps metadata more frequently.
  const chars = widthMm === 58 ? 29 : 44;
  let height = widthMm === 58 ? 115 : 103;
  for (const item of items) {
    const identity = `Code (SKU) ${item.sku}${item.serialNo ? ` / Device no. ${item.serialNo}` : ''}`;
    height += 9;
    height += wrappedLines(item.productName, chars) * 3.6;
    height += wrappedLines(identity, chars) * 3;
    if (item.usedGrade) height += 3.2;
    height += wrappedLines(item.knownDefects, chars) * 3.2;
    height += wrappedLines(cosmeticSummary(item.cosmeticCondition), chars) * 3.2;
    if (item.warrantyDays || item.warrantyMonths) height += 3.2;
  }
  if (sale.tradeInDetails) height += 20 + wrappedLines(sale.tradeInDetails.productName, chars) * 3.2 + wrappedLines(cosmeticSummary(sale.tradeInDetails.cosmeticCondition), chars) * 3.2;
  if (sale.reference) height += wrappedLines(`Ref: ${sale.reference}`, chars) * 3;
  if (emi) height += 55 + emi.installments.length * (widthMm === 58 ? 19 : 15);
  if (sale.note) height += 8 + wrappedLines(sale.note, chars) * 3.2;
  if (sale.status === 'VOIDED') height += 15 + wrappedLines(sale.voidReason, chars) * 3.2;
  return Math.min(1000, Math.max(95, Math.ceil(height)));
}

function PdfEmiSchedule({ emi, voided, thermal = false }: { emi: EmiInvoiceData; voided: boolean; thermal?: boolean }) {
  const settlement = voided ? null : emi.earlySettlement;
  return <View style={thermal ? thermalStyles.box : styles.tradeIn}>
    <Text style={thermal ? thermalStyles.label : styles.label}>{settlement ? 'Adjusted installment schedule' : 'Installment schedule'}</Text>
    <Text style={{ fontSize: thermal ? 7 : 8, marginBottom: 5 }}>Shop-managed EMI</Text>
    {settlement && <Text style={{ fontSize: thermal ? 7 : 8, marginBottom: 6 }}>Due before discount {money(settlement.outstandingBefore)} - discount {money(settlement.discountAmount)} = final payment {money(settlement.finalAmount)}</Text>}
    {emiScheduleRows(emi.contract, emi.installments, emi.earlySettlement).map((row) => <View key={row.id} wrap={false} style={{ borderTopWidth: 0.3, borderTopColor: '#d5dade', paddingVertical: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}><Text style={{ fontSize: thermal ? 7 : 9 }}>#{row.sequence} · {voided ? 'Voided' : row.status.toLowerCase()}</Text><Text style={{ fontSize: thermal ? 7 : 9, fontFamily: 'Helvetica-Bold' }}>{money(row.amountDue)}</Text></View>
      <Text style={{ fontSize: thermal ? 6.5 : 8, marginTop: 2 }}>{emiScheduleDate(row.dueDate)}{row.discount > 0 ? ` · Was ${money(row.originalAmount)} · discount -${money(row.discount)}` : ''}</Text>
    </View>)}
  </View>;
}

function InvoiceDocument({
  sale,
  items,
  shop,
  emi,
  settlements,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: { name: string; logoDataUri: string | null; address: string | null; phone: string | null; policy: string | null };
  emi: EmiInvoiceData | null;
  settlements: SaleSettlement[];
}) {
  const collectibleTotal = Math.max(0, sale.total - sale.tradeInCredit);
  const paidAmount = Math.min(collectibleTotal, Math.max(0, sale.amountPaid ?? 0));
  const amountDue = regularInvoiceAmountDue(sale);
  const emiSummary = emi ? emiInvoiceSummary(emi, sale.status === 'VOIDED') : null;
  const tradeInCashPayout = Math.max(0, sale.tradeInCredit - sale.total);
  const tradeInCashRecovered = recoveredTradeInPayout(settlements);
  const rawEmiStatus = emi ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement) : null;
  const paymentBadge = sale.status === 'VOIDED'
    ? null
    : rawEmiStatus
      ? `EMI / ${rawEmiStatus.replaceAll('_', ' ')}`
      : sale.paymentStatus === 'UNPAID'
        ? 'UNPAID'
        : `${sale.paymentMethod.replaceAll('_', ' ')} / ${sale.paymentStatus.replaceAll('_', ' ')}`;
  return (
    <Document title={sale.invoiceNumber} author={shop.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {shop.logoDataUri
              ? <Image src={shop.logoDataUri} style={styles.logo} />
              : <Text style={styles.shopName}>{shop.name}</Text>}
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
            <Text style={styles.label}>Sale date</Text>
            <Text> {dateTime(saleOccurredAt(sale))}</Text>
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
              {cosmeticSummary(item.cosmeticCondition) && <Text style={styles.muted}>{cosmeticSummary(item.cosmeticCondition)}</Text>}
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
            {cosmeticSummary(sale.tradeInDetails.cosmeticCondition) && <Text>{cosmeticSummary(sale.tradeInDetails.cosmeticCondition)}</Text>}
            <Text style={styles.muted}>Code (SKU) {sale.tradeInDetails.sku} / Device no. {sale.tradeInDetails.serialNo}</Text>
            <Text style={styles.muted}>{sale.tradeInDetails.grade === 'REFURBISHED' ? 'Refurbished' : sale.tradeInDetails.grade.replace('GRADE_', 'Grade ')} / Credit {money(sale.tradeInDetails.acquisitionValue)}</Text>
          </View>
        )}
        <View style={styles.summary}>
          {emi ? (
            <>
{emiSummary?.rows.map((row) => <View key={row.label} style={[styles.summaryRow, row.label === 'Outstanding' ? styles.total : {}]}><Text>{row.label}</Text><Text>{row.deduction ? '-' : ''}{money(row.amount)}</Text></View>)}
            </>
          ) : (
            <>
              <View style={[styles.summaryRow, styles.total]}><Text>Total</Text><Text>{money(sale.total)}</Text></View>
              {sale.tradeInCredit > 0 && (
                <>
                  <View style={styles.summaryRow}><Text>Trade-in credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>
                  {tradeInCashPayout > 0 && <View style={styles.summaryRow}><Text>Trade-in cash payout</Text><Text>{money(tradeInCashPayout)}</Text></View>}
                </>
              )}
              {collectibleTotal > 0 && <View style={styles.summaryRow}><Text>Paid amount</Text><Text>{money(paidAmount)}</Text></View>}
              {collectibleTotal > 0 && <View style={[styles.summaryRow, styles.total]}><Text>Amount due</Text><Text>{money(amountDue)}</Text></View>}
            </>
          )}
        </View>
        {emi && (
<PdfEmiSchedule emi={emi} voided={sale.status === 'VOIDED'} />
        )}
        {(sale.note || sale.status === 'VOIDED') && <View style={styles.payment}>
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
                {tradeInCashRecovered > 0 ? ` Trade-in cash recovered: ${money(tradeInCashRecovered)}.` : ''}
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

function ThermalInvoiceDocument({
  sale,
  items,
  shop,
  emi,
  widthMm,
  settlements,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: { name: string; logoDataUri: string | null; address: string | null; phone: string | null; policy: string | null };
  emi: EmiInvoiceData | null;
  widthMm: 58 | 80;
  settlements: SaleSettlement[];
}) {
  const collectibleTotal = Math.max(0, sale.total - sale.tradeInCredit);
  const paidAmount = Math.min(collectibleTotal, Math.max(0, sale.amountPaid ?? 0));
  const amountDue = regularInvoiceAmountDue(sale);
  const emiSummary = emi ? emiInvoiceSummary(emi, sale.status === 'VOIDED') : null;
  const rawEmiStatus = emi ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement) : null;
  const badge = sale.status === 'VOIDED'
    ? null
    : rawEmiStatus ? `EMI / ${rawEmiStatus.replaceAll('_', ' ')}` : sale.paymentStatus === 'UNPAID' ? 'UNPAID' : `${sale.paymentMethod.replaceAll('_', ' ')} / ${sale.paymentStatus.replaceAll('_', ' ')}`;
  const heightMm = thermalInvoiceHeightMm(sale, items, emi, widthMm);
  const tradeInCashPayout = Math.max(0, sale.tradeInCredit - sale.total);
  const tradeInCashRecovered = recoveredTradeInPayout(settlements);

  return <Document title={sale.invoiceNumber} author={shop.name}>
    <Page
      size={{ width: widthMm * MM_TO_PT, height: heightMm * MM_TO_PT }}
      style={[thermalStyles.page, widthMm === 58 ? thermalStyles.page58 : thermalStyles.page80]}
      wrap={false}
    >
      {shop.logoDataUri
        ? <Image src={shop.logoDataUri} style={[thermalStyles.logo, widthMm === 58 ? thermalStyles.logo58 : thermalStyles.logo80]} />
        : <Text style={thermalStyles.shopName}>{shop.name}</Text>}
      {shop.address && <Text style={[thermalStyles.muted, thermalStyles.centered]}>{shop.address}</Text>}
      {shop.phone && <Text style={[thermalStyles.muted, thermalStyles.centered]}>{shop.phone}</Text>}
      <Text style={[thermalStyles.title, sale.status === 'VOIDED' ? thermalStyles.voided : {}]}>
        {sale.status === 'VOIDED' ? 'VOIDED INVOICE' : 'INVOICE'}
      </Text>
      <Text style={[thermalStyles.muted, thermalStyles.centered]}>{sale.invoiceNumber}</Text>
      {badge && <Text style={thermalStyles.badge}>{badge}</Text>}
      <View style={thermalStyles.servedBy}>
        <Text style={thermalStyles.servedByLabel}>Served By</Text>
        <Text style={thermalStyles.servedByName}>{sale.actorName}</Text>
      </View>
      <View style={[thermalStyles.divider, thermalStyles.headerDivider]} />
      <View style={[thermalStyles.section, widthMm === 80 ? thermalStyles.metaRow : {}]}>
        <View style={widthMm === 80 ? thermalStyles.metaColumn : {}}>
          <Text style={thermalStyles.label}>Customer</Text>
          <Text>{sale.customerName ?? 'Walk-in customer'}</Text>
          {sale.customerPhone && <Text style={thermalStyles.muted}>{sale.customerPhone}</Text>}
        </View>
        <View style={[widthMm === 80 ? thermalStyles.metaColumn : {}, widthMm === 58 ? thermalStyles.metaDate58 : {}]}>
          <Text style={thermalStyles.label}>Date</Text>
          <Text>Sale date: {dateTime(saleOccurredAt(sale))}</Text>
          {sale.reference && <Text style={thermalStyles.muted}>Ref: {sale.reference}</Text>}
        </View>
      </View>
      <View style={thermalStyles.divider} />
      <View style={thermalStyles.itemHeader}>
        <Text style={thermalStyles.itemHeaderName}>ITEM</Text>
        <Text style={thermalStyles.itemHeaderQty}>QTY</Text>
        <Text style={thermalStyles.itemHeaderTotal}>TOTAL</Text>
      </View>
      {items.map((item) => <View key={item.id} style={thermalStyles.item} wrap={false}>
        <View style={thermalStyles.itemBody}>
          <Text style={thermalStyles.itemName}>{item.productName}</Text>
          <Text style={thermalStyles.muted}>Code (SKU) {item.sku}{item.serialNo ? ` / Device no. ${item.serialNo}` : ''}</Text>
          {item.usedGrade && <Text style={thermalStyles.muted}>Used phone · {item.usedGrade === 'REFURBISHED' ? 'Refurbished' : item.usedGrade.replace('GRADE_', 'Grade ')}</Text>}
          {cosmeticSummary(item.cosmeticCondition) && <Text style={thermalStyles.muted}>{cosmeticSummary(item.cosmeticCondition)}</Text>}
              {item.knownDefects && <Text style={thermalStyles.muted}>Declared defects: {item.knownDefects}</Text>}
          {item.warrantyDays ? <Text style={thermalStyles.muted}>{item.warrantyDays} day warranty</Text> : item.warrantyMonths ? <Text style={thermalStyles.muted}>{item.warrantyMonths} month warranty</Text> : null}
        </View>
        <Text style={thermalStyles.itemQty}>{item.quantity}</Text>
        <Text style={thermalStyles.itemTotal}>{money(item.lineTotal)}</Text>
      </View>)}
      {sale.tradeInDetails && <View style={thermalStyles.box} wrap={false}>
        <Text style={thermalStyles.label}>Trade-in device</Text>
        <Text>{sale.tradeInDetails.productName}</Text>
            {cosmeticSummary(sale.tradeInDetails.cosmeticCondition) && <Text>{cosmeticSummary(sale.tradeInDetails.cosmeticCondition)}</Text>}
        <Text style={thermalStyles.muted}>{sale.tradeInDetails.sku} / {sale.tradeInDetails.serialNo}</Text>
        <View style={thermalStyles.line}><Text>Credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>
      </View>}
      <View style={thermalStyles.summary} wrap={false}>
        {emi ? <>
{emiSummary?.rows.map((row) => <View key={row.label} style={row.label === 'Outstanding' ? thermalStyles.totalLine : thermalStyles.line}><Text style={{ maxWidth: '60%' }}>{row.label}</Text><Text>{row.deduction ? '-' : ''}{money(row.amount)}</Text></View>)}
          <PdfEmiSchedule emi={emi} voided={sale.status === 'VOIDED'} thermal />
        </> : <>
          <View style={thermalStyles.totalLine}><Text>Total</Text><Text>{money(sale.total)}</Text></View>
          {sale.tradeInCredit > 0 && <View style={thermalStyles.line}><Text>Trade-in credit</Text><Text>-{money(sale.tradeInCredit)}</Text></View>}
          {tradeInCashPayout > 0 && <View style={thermalStyles.line}><Text>Trade-in cash payout</Text><Text>{money(tradeInCashPayout)}</Text></View>}
          {collectibleTotal > 0 && <View style={thermalStyles.line}><Text>Paid amount</Text><Text>{money(paidAmount)}</Text></View>}
          {collectibleTotal > 0 && <View style={thermalStyles.totalLine}><Text>Amount due</Text><Text>{money(amountDue)}</Text></View>}
        </>}
      </View>
      {sale.note && <View style={thermalStyles.box}><Text style={thermalStyles.label}>Note</Text><Text>{sale.note}</Text></View>}
      {sale.status === 'VOIDED' && <View style={thermalStyles.box}>
        <Text style={[thermalStyles.label, thermalStyles.voided]}>Voided</Text>
        <Text style={thermalStyles.voided}>
          {sale.voidedAt ? dateTime(sale.voidedAt) : 'Recorded'}{sale.voidedByName ? ` by ${sale.voidedByName}` : ''}.
          {' '}Reason: {sale.voidReason ?? 'Not recorded'}. Refund: {money(sale.refundAmount ?? 0)}{sale.refundMethod ? ` via ${sale.refundMethod.replaceAll('_', ' ')}` : ''}.
          {tradeInCashRecovered > 0 ? ` Trade-in cash recovered: ${money(tradeInCashRecovered)}.` : ''}
        </Text>
      </View>}
      {shop.policy && <Text style={[thermalStyles.muted, { marginTop: 7 }]}>{shop.policy}</Text>}
    </Page>
  </Document>;
}

export async function invoiceToPdf(
  sale: Sale,
  items: InvoiceItem[],
  shop: { name: string; logoDataUri: string | null; address: string | null; phone: string | null; policy: string | null },
  emi: EmiInvoiceData | null = null,
  settlements: SaleSettlement[] = [],
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument sale={sale} items={items} shop={shop} emi={emi} settlements={settlements} />);
}

export async function invoiceToThermalPdf(
  sale: Sale,
  items: InvoiceItem[],
  shop: { name: string; logoDataUri: string | null; address: string | null; phone: string | null; policy: string | null },
  emi: EmiInvoiceData | null,
  widthMm: 58 | 80,
  settlements: SaleSettlement[] = [],
): Promise<Buffer> {
  return renderToBuffer(<ThermalInvoiceDocument sale={sale} items={items} shop={shop} emi={emi} widthMm={widthMm} settlements={settlements} />);
}
