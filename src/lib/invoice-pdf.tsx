import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { InvoiceItem, Sale } from '@/domain/types';

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: 'Helvetica', fontSize: 9, color: '#14181d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  shop: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
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
  footer: { position: 'absolute', left: 34, right: 34, bottom: 24, color: '#626c76', fontSize: 7 },
});

function money(value: number): string {
  return `BDT ${(value / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function InvoiceDocument({
  sale,
  items,
  shop,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: { name: string; address: string | null; phone: string | null; policy: string | null };
}) {
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
            <Text style={styles.title}>INVOICE</Text>
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
            <Text style={styles.muted}>{sale.paymentMethod.replaceAll('_', ' ')} / {sale.paymentStatus}</Text>
          </View>
        </View>
        <View style={[styles.row, styles.tableHead]}>
          <Text style={styles.item}>Item</Text><Text style={styles.qty}>Qty</Text><Text style={styles.amount}>Unit price</Text><Text style={styles.amount}>Total</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} style={styles.row} wrap={false}>
            <View style={styles.item}>
              <Text>{item.productName}</Text>
              <Text style={styles.muted}>{item.sku}{item.serialNo ? ` / S/N ${item.serialNo}` : ''}</Text>
            </View>
            <Text style={styles.qty}>{item.quantity}</Text>
            <Text style={styles.amount}>{money(item.actualUnitPrice)}</Text>
            <Text style={styles.amount}>{money(item.lineTotal)}</Text>
          </View>
        ))}
        <View style={styles.summary}>
          <View style={styles.summaryRow}><Text>List subtotal</Text><Text>{money(sale.subtotal)}</Text></View>
          {sale.discount !== 0 && <View style={styles.summaryRow}><Text>Price adjustment</Text><Text>{money(sale.discount)}</Text></View>}
          <View style={[styles.summaryRow, styles.total]}><Text>Total</Text><Text>{money(sale.total)}</Text></View>
        </View>
        {sale.note && <Text style={styles.note}>Note: {sale.note}</Text>}
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
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument sale={sale} items={items} shop={shop} />);
}
