import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { EmiContract, EmiEarlySettlement, EmiInstallment, InvoiceItem, Sale } from '@/domain/types';
import { emiDisplayStatus } from '@/lib/emi-summary';

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: 'Helvetica', fontSize: 9, color: '#14181d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  shop: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  voided: { color: '#b42318' },
  muted: { color: '#626c76', fontSize: 8, marginTop: 2 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  metaBox: { width: '47%' },
  label: { color: '#626c76', fontSize: 7, textTransform: 'uppercase', marginBottom: 3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d5dade', paddingVertical: 6 },
  tableHead: { backgroundColor: '#e9ecee', fontFamily: 'Helvetica-Bold' },
  item: { width: '55%' },
  qty: { width: '10%', textAlign: 'right' },
  amount: { width: '17.5%', textAlign: 'right' },
  summary: { marginLeft: '55%', marginTop: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  total: { borderTopWidth: 1, paddingTop: 6, marginTop: 3, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  note: { marginTop: 18, color: '#626c76', fontSize: 8 },
  tradeIn: { marginTop: 12, borderWidth: 0.5, borderColor: '#d5dade', padding: 8 },
  footer: { position: 'absolute', left: 34, right: 34, bottom: 24, color: '#626c76', fontSize: 7 },
});

function money(value: number): string {
  return `BDT ${(value / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const currentEmiStatus = emi
    ? emiDisplayStatus(emi.contract, emi.installments, emi.earlySettlement).replaceAll('_', ' ')
    : null;
  return (
    <Document title={sale.invoiceNumber} author={shop.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.shop}>{shop.name}</Text>
            {shop.address && <Text style={styles.muted}>{shop.address}</Text>}
            {shop.phone && <Text style={styles.muted}>{shop.phone}</Text>}
          </View>
          <View>
            <Text style={[styles.title, sale.status === 'VOIDED' ? styles.voided : {}]}>
              {sale.status === 'VOIDED' ? 'VOIDED INVOICE' : 'INVOICE'}
            </Text>
            <Text style={styles.muted}>{sale.invoiceNumber}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaBox}>
            <Text style={styles.label}>Customer</Text>
            <Text>{sale.customerName ?? 'Walk-in customer'}</Text>
            {sale.customerPhone && <Text style={styles.muted}>{sale.customerPhone}</Text>}
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.label}>Sale details</Text>
            <Text>{new Date(sale.completedAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}</Text>
            <Text style={styles.muted}>Served by {sale.actorName}</Text>
            <Text style={styles.muted}>
              {emi ? `Shop-managed EMI / ${currentEmiStatus}` : `${sale.paymentMethod.replaceAll('_', ' ')} / ${sale.paymentStatus}`}
            </Text>
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
            <Text style={styles.label}>Payment plan</Text>
            <Text>Shop-managed EMI / {currentEmiStatus}</Text>
            <Text style={styles.muted}>{emi.contract.contractNumber} / {emi.contract.termMonths} monthly installments</Text>
            <Text style={styles.muted}>Down payment: {money(emi.contract.downPayment)} via {sale.paymentMethod.replaceAll('_', ' ')}</Text>
            <Text style={styles.muted}>Financed amount: {money(emi.contract.financedAmount)}</Text>
          </View>
        )}
        {sale.note && <Text style={styles.note}>Note: {sale.note}</Text>}
        {sale.status === 'VOIDED' && (
          <Text style={[styles.note, styles.voided]}>
            VOIDED {sale.voidedAt ? new Date(sale.voidedAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' }) : ''}
            {sale.voidedByName ? ` by ${sale.voidedByName}` : ''}. Reason: {sale.voidReason ?? 'Not recorded'}.
            {' '}Refund: {money(sale.refundAmount ?? 0)}{sale.refundMethod ? ` via ${sale.refundMethod.replaceAll('_', ' ')}` : ''}.
          </Text>
        )}
        <View style={styles.footer}>
          {shop.policy && <Text>{shop.policy}</Text>}
          <Text>This is an ordinary sales invoice, not a VAT/tax invoice.</Text>
        </View>
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
