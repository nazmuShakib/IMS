"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type HTMLAttributes,
} from "react";
import { Trash2 } from "lucide-react";
import Link from "next/link";

import {
  addCartItemAction,
  checkoutAction,
  clearTradeInDraftAction,
  removeCartItemAction,
  reorderCartItemsAction,
  updateCartDetailsAction,
  updateCartItemAction,
  type CheckoutActionState,
} from "@/actions/checkout";
import { ScannerInput } from "@/components/search/ScannerInput";
import { DiscardDraftControl } from "@/components/checkout/DiscardDraftControl";
import { CreateCustomerForm } from "@/components/customers/CreateCustomerForm";
import {
  Button,
  Card,
  Field,
  HelpTerm,
  Input,
  MonoInput,
  Select,
  SerialChip,
  Textarea,
} from "@/components/ui";
import type {
  CartDraft,
  Customer,
  PaymentMethod,
  PaymentStatus,
  TrackingType,
  Role,
} from "@/domain/types";
import { formatBDT, toTaka } from "@/lib/money";
import { useI18n } from "@/components/i18n/I18nProvider";
import { domainLabel } from "@/lib/i18n/domain";
import { emiCheckoutFieldsSchema } from "@/schemas";

export interface CheckoutProductOption {
  id: string;
  name: string;
  sku: string;
  trackingType: TrackingType;
  onHand: number;
}

export interface CheckoutUnitOption {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  serialNo: string;
  usedGrade: string | null;
}

export interface CheckoutLine {
  id: string;
  productId: string;
  unitId: string | null;
  productName: string;
  sku: string;
  serialNo: string | null;
  trackingType: TrackingType;
  quantity: number;
  listUnitPrice: number;
  actualUnitPrice: number;
  staffMaxDiscount: number;
  position: number;
  onHand: number;
  usedGrade: string | null;
  knownDefects: string | null;
  warrantyMonths: number | null;
  warrantyDays: number | null;
}

function Message({ state }: { state: CheckoutActionState }) {
  const { message } = useI18n();
  if (state.error)
    return <p className="mt-2 text-[12px] text-out">{message(state.error)}</p>;
  if (state.ok)
    return <p className="mt-2 text-[12px] text-ok">{message(state.ok)}</p>;
  return null;
}

function CartLineEditor({
  cartId,
  line,
  dragProps,
  dragging,
  dragDisabled,
  onPendingChange,
  onValidityChange,
  staffMinimumPrice,
  isEmi,
}: {
  cartId: string;
  line: CheckoutLine;
  dragProps: HTMLAttributes<HTMLDivElement>;
  dragging: boolean;
  dragDisabled: boolean;
  onPendingChange: (lineId: string, pending: boolean) => void;
  onValidityChange: (lineId: string, valid: boolean) => void;
  staffMinimumPrice: number | null;
  isEmi: boolean;
}) {
  const { t } = useI18n();
  const [updateState, updateAction, updating] = useActionState(
    updateCartItemAction,
    {},
  );
  const [removeState, removeAction, removing] = useActionState(
    removeCartItemAction,
    {},
  );
  const [quantityValue, setQuantityValue] = useState(String(line.quantity));
  const [priceValue, setPriceValue] = useState(
    String(toTaka(line.actualUnitPrice)),
  );
  const [saveQueued, setSaveQueued] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const maximumQuantity = Math.max(1, line.onHand);
  const parsedQuantity = Number.parseInt(quantityValue, 10);
  const quantity = Number.isFinite(parsedQuantity)
    ? Math.min(maximumQuantity, Math.max(1, parsedQuantity))
    : line.quantity;
  const parsedPrice = Number(priceValue);
  const displayUnitPrice =
    Number.isFinite(parsedPrice) && parsedPrice >= 0
      ? Math.round(parsedPrice * 100)
      : line.actualUnitPrice;
  const priceFormatValid = isEmi ? /^\d+$/.test(priceValue) : /^\d+(\.\d{1,2})?$/.test(priceValue);
  const emiPriceHasFraction = isEmi && /^\d+\.\d{1,2}$/.test(priceValue);
  const priceBelowFloor = staffMinimumPrice !== null && displayUnitPrice < staffMinimumPrice;
  const priceValid = priceFormatValid && !priceBelowFloor;
  const linePending = saveQueued || updating;
  const formId = `cart-line-${line.id}`;

  const clearSaveTimer = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  };

  const queueSave = (delay = 650) => {
    if (!dirtyRef.current) return;
    clearSaveTimer();
    setSaveQueued(true);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      formRef.current?.requestSubmit();
    }, delay);
  };

  useEffect(() => {
    setQuantityValue(String(line.quantity));
    setPriceValue(String(toTaka(line.actualUnitPrice)));
  }, [line.actualUnitPrice, line.quantity]);

  useEffect(() => {
    onPendingChange(line.id, linePending);
  }, [line.id, linePending, onPendingChange]);

  useEffect(() => {
    onValidityChange(line.id, priceValid);
  }, [line.id, onValidityChange, priceValid]);

  useEffect(() => {
    if (updating || (!updateState.ok && !updateState.error)) return;
    dirtyRef.current = false;
    setSaveQueued(false);
    if (updateState.error) {
      setQuantityValue(String(line.quantity));
      setPriceValue(String(toTaka(line.actualUnitPrice)));
    }
  }, [line.actualUnitPrice, line.quantity, updateState, updating]);

  useEffect(
    () => () => {
      clearSaveTimer();
      onPendingChange(line.id, false);
      onValidityChange(line.id, true);
    },
    [line.id, onPendingChange, onValidityChange],
  );

  const stepQuantity = (change: -1 | 1) => {
    dirtyRef.current = true;
    setQuantityValue((currentValue) => {
      const current = Number.parseInt(currentValue, 10);
      const startingQuantity = Number.isFinite(current)
        ? current
        : line.quantity;
      return String(
        Math.min(maximumQuantity, Math.max(1, startingQuantity + change)),
      );
    });
    queueSave();
  };

  const prepareRemove = () => {
    clearSaveTimer();
    dirtyRef.current = false;
    setSaveQueued(false);
  };

  return (
    <div
      data-cart-line-id={line.id}
      tabIndex={dragDisabled ? undefined : 0}
      {...dragProps}
      className={`border-b border-rule-soft px-4 py-3 transition-[background-color,box-shadow,transform] last:border-0 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-signal ${
        dragDisabled ? "" : "touch-none cursor-grab active:cursor-grabbing"
      } ${dragging ? "relative z-10 bg-signal-wash shadow-md" : "hover:bg-plate/35"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{line.productName}</p>
          <p className="tnum text-[11px] text-graphite">{line.sku}</p>
          {line.usedGrade && <p className="mt-1 text-[11px] font-medium text-signal">{line.usedGrade === 'REFURBISHED' ? t('used.refurbished') : `${t('used.usedPhone')} · ${line.usedGrade.replace('GRADE_', `${t('used.grade')} `)}`}</p>}
          {(line.warrantyDays || line.warrantyMonths) && (
            <p className="mt-1 text-[11px] text-graphite">
              {t('used.warrantyDuration')}: {line.warrantyDays
                ? `${line.warrantyDays} ${line.warrantyDays === 1 ? t('used.warrantyDay') : t('used.warrantyDays')}`
                : `${line.warrantyMonths} ${line.warrantyMonths === 1 ? t('used.warrantyMonth') : t('used.warrantyMonths')}`}
            </p>
          )}
          {line.knownDefects && <p className="mt-1 max-w-xl text-[11px] text-out">{t('used.knownDefects')}: {line.knownDefects}</p>}
          <p className="mt-1 text-[11px] text-graphite">
            {t("checkout.listPrice", { price: formatBDT(line.listUnitPrice) })}
          </p>
        </div>
        <p className="tnum text-[13px] font-semibold">
          {formatBDT(
            displayUnitPrice * (line.trackingType === "SERIAL" ? 1 : quantity),
          )}
        </p>
      </div>
      <form
        id={formId}
        ref={formRef}
        action={updateAction}
        className="mt-3 grid gap-2 sm:grid-cols-[9rem_10rem_auto]"
      >
        <input type="hidden" name="cartId" value={cartId} />
        <input type="hidden" name="itemId" value={line.id} />
        {line.trackingType === "SERIAL" ? (
          <Field label={t("checkout.serialImei")}>
            <div className="flex min-h-10 items-center">
              {line.serialNo ? (
                <SerialChip serial={line.serialNo} />
              ) : (
                <span className="text-graphite">—</span>
              )}
            </div>
            <input type="hidden" name="quantity" value="1" />
          </Field>
        ) : (
          <Field label={t("common.quantity")}>
            <div className="inline-grid grid-cols-[2.25rem_4.5rem_2.25rem]">
              <input type="hidden" name="quantity" value={quantity} />
              <button
                type="button"
                className="h-9 rounded-l-[3px] border border-rule bg-card text-[18px] leading-none text-ink transition-colors hover:border-signal hover:bg-signal-wash disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("checkout.decreaseQuantity")}
                onClick={() => stepQuantity(-1)}
                disabled={updating || quantity <= 1}
              >
                −
              </button>
              <MonoInput
                className="rounded-none px-1 text-center"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={t("common.quantity")}
                value={quantityValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "" || /^\d+$/.test(value)) {
                    dirtyRef.current = true;
                    setQuantityValue(value);
                    if (value === "") {
                      clearSaveTimer();
                      setSaveQueued(true);
                    } else {
                      queueSave();
                    }
                  }
                }}
                onBlur={() => {
                  setQuantityValue(String(quantity));
                  queueSave(0);
                }}
              />
              <button
                type="button"
                className="h-9 rounded-r-[3px] border border-rule bg-card text-[18px] leading-none text-ink transition-colors hover:border-signal hover:bg-signal-wash disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("checkout.increaseQuantity")}
                onClick={() => stepQuantity(1)}
                disabled={updating || quantity >= maximumQuantity}
              >
                +
              </button>
            </div>
          </Field>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-end gap-2 sm:contents">
          <Field
            label={isEmi ? t("checkout.emiSellingPrice") : t("products.sellingPrice")}
            hint={staffMinimumPrice !== null
              ? t('checkout.staffMinimumPrice', { price: formatBDT(staffMinimumPrice) })
              : undefined}
            error={emiPriceHasFraction
              ? t("checkout.wholeTakaEmiPrice")
              : priceBelowFloor ? t('checkout.staffPriceTooLow') : undefined}
          >
            <MonoInput
              name="actualUnitPrice"
              inputMode="decimal"
              step={isEmi ? "1" : "0.01"}
              required
              min={staffMinimumPrice === null ? undefined : toTaka(staffMinimumPrice)}
              value={priceValue}
              onChange={(event) => {
                const value = event.target.value;
                dirtyRef.current = true;
                setPriceValue(value);
                const entered = Number(value);
                const validFormat = isEmi ? /^\d+$/.test(value) : /^\d+(\.\d{1,2})?$/.test(value);
                if (validFormat
                  && (staffMinimumPrice === null || Math.round(entered * 100) >= staffMinimumPrice)) {
                  queueSave();
                } else {
                  clearSaveTimer();
                  setSaveQueued(false);
                }
              }}
              onBlur={() => {
                if (priceFormatValid && !priceBelowFloor) queueSave(0);
              }}
            />
          </Field>
          <button
            type="submit"
            formAction={removeAction}
            formNoValidate
            disabled={removing}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-rule bg-card text-out transition-colors hover:bg-out-wash disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
            aria-label={t("checkout.remove")}
            title={t("checkout.remove")}
            onClick={prepareRemove}
          >
            <Trash2 aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.25} />
          </button>
        </div>
        <div className="flex items-end justify-between gap-2 sm:justify-end">
          {linePending && (
            <span className="pb-2 text-[11px] font-medium text-signal">
              {t(
                updating ? "checkout.savingChanges" : "checkout.unsavedChanges",
              )}
            </span>
          )}
          <div className="hidden sm:block">
            <Button
              type="submit"
              variant="danger"
              formAction={removeAction}
              formNoValidate
              disabled={removing}
              className="gap-1.5"
              onClick={prepareRemove}
            >
              <Trash2 aria-hidden="true" size={15} />
              {t("checkout.remove")}
            </Button>
          </div>
        </div>
      </form>
      <Message state={updateState.error ? updateState : removeState} />
    </div>
  );
}

export function CheckoutWorkspace({
  cart,
  initialIdentifier,
  lines,
  products,
  units,
  customers,
  role,
}: {
  cart: CartDraft;
  initialIdentifier?: string;
  lines: CheckoutLine[];
  products: CheckoutProductOption[];
  units: CheckoutUnitOption[];
  customers: Customer[];
  role: Role;
}) {
  const { t, message } = useI18n();
  const [checkoutKey, setCheckoutKey] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(cart.customerId ?? "");
  const [saleMode, setSaleMode] = useState<"CASH" | "EMI">(cart.isEmi ? "EMI" : "CASH");
  const [emiTerm, setEmiTerm] = useState(cart.emiTermMonths ?? 3);
  const [emiDownPayment, setEmiDownPayment] = useState(String(toTaka(cart.emiDownPayment ?? 0)));
  const [emiFirstDueDate, setEmiFirstDueDate] = useState(cart.emiFirstDueDate?.slice(0, 10) ?? "");
  // Identification is verified per EMI sale. Do not carry a document number
  // from a customer's previous checkout into a new transaction.
  const [identificationType, setIdentificationType] = useState("");
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [emiErrors, setEmiErrors] = useState<Record<string, string>>({});
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [confirmingTradeInRemoval, setConfirmingTradeInRemoval] = useState(false);
  const [orderedLines, setOrderedLines] = useState(lines);
  const orderedLinesRef = useRef(lines);
  const cartLinesRef = useRef<HTMLDivElement>(null);
  const previousLinePositionsRef = useRef<Map<string, DOMRect> | null>(null);
  const lineAnimationsRef = useRef<Map<string, Animation>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [reorderState, setReorderState] = useState<CheckoutActionState>({});
  const [reordering, startReordering] = useTransition();
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [invalidLineIds, setInvalidLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [addState, addAction, adding] = useActionState(addCartItemAction, {});
  const [detailState, detailAction, saving] = useActionState(
    updateCartDetailsAction,
    {},
  );
  const [checkoutState, completeAction, checkingOut] = useActionState(
    checkoutAction,
    {},
  );
  const [clearTradeInState, clearTradeInAction, clearingTradeIn] = useActionState(
    clearTradeInDraftAction,
    {},
  );
  const lineUpdatesPending = pendingLineIds.size > 0;
  const hasInvalidLines = invalidLineIds.size > 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  const maxEmiDueDate = useMemo(() => {
    const value = new Date(`${today}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + 31);
    return value.toISOString().slice(0, 10);
  }, [today]);

  function clearEmiError(field: string) {
    setEmiErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  }

  function chooseCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setIdentificationType("");
    setIdentificationNumber("");
    clearEmiError('identificationType'); clearEmiError('identificationNumber');
  }

  function requestCheckoutConfirmation() {
    if (isEmi) {
      const parsed = emiCheckoutFieldsSchema.safeParse({
        isEmi: true,
        termMonths: emiTerm,
        downPayment: emiDownPayment,
        firstDueDate: emiFirstDueDate,
        identificationType,
        identificationNumber,
      });
      if (!parsed.success) {
        setEmiErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
        return;
      }
    }
    setEmiErrors({});
    setConfirmingCheckout(true);
  }

  const handleLinePending = useCallback((lineId: string, pending: boolean) => {
    setPendingLineIds((current) => {
      if (current.has(lineId) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(lineId);
      else next.delete(lineId);
      return next;
    });
  }, []);

  const handleLineValidity = useCallback((lineId: string, valid: boolean) => {
    setInvalidLineIds((current) => {
      if (current.has(lineId) === !valid) return current;
      const next = new Set(current);
      if (valid) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  useEffect(() => setCheckoutKey(crypto.randomUUID()), []);

  useEffect(() => {
    setOrderedLines(lines);
    orderedLinesRef.current = lines;
  }, [lines]);

  useLayoutEffect(() => {
    const previous = previousLinePositionsRef.current;
    const container = cartLinesRef.current;
    previousLinePositionsRef.current = null;
    if (
      !previous ||
      !container ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    for (const element of container.querySelectorAll<HTMLElement>(
      "[data-cart-line-id]",
    )) {
      const id = element.dataset.cartLineId;
      const before = id ? previous.get(id) : undefined;
      if (!id || !before) continue;
      const after = element.getBoundingClientRect();
      const deltaY = before.top - after.top;
      if (Math.abs(deltaY) < 1) continue;
      lineAnimationsRef.current.get(id)?.cancel();
      const animation = element.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      lineAnimationsRef.current.set(id, animation);
      animation.finished
        .finally(() => {
          if (lineAnimationsRef.current.get(id) === animation) {
            lineAnimationsRef.current.delete(id);
          }
        })
        .catch(() => undefined);
    }
  }, [orderedLines]);

  useEffect(() => {
    if (!confirmingCheckout) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !checkingOut) setConfirmingCheckout(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmingCheckout, checkingOut]);

  useEffect(() => {
    if (clearTradeInState.ok) setConfirmingTradeInRemoval(false);
  }, [clearTradeInState.ok]);

  const quantityProducts = products.filter(
    (product) => product.trackingType === "QUANTITY",
  );
  const visibleCustomers = customers.filter((customer) => {
    const query = customerQuery.trim().toLowerCase();
    return (
      !query ||
      customer.name.toLowerCase().includes(query) ||
      customer.phone?.toLowerCase().includes(query)
    );
  });
  const subtotal = useMemo(
    () =>
      orderedLines.reduce(
        (sum, line) => sum + line.listUnitPrice * line.quantity,
        0,
      ),
    [orderedLines],
  );
  const isEmi = saleMode === "EMI";
  const total = useMemo(
    () =>
      orderedLines.reduce((sum, line) => sum + line.actualUnitPrice * line.quantity, 0),
    [orderedLines],
  );
  const tradeInProduct = products.find((product) => product.id === cart.tradeInDraft?.productId);
  const tradeInCredit = cart.tradeInDraft?.acquisitionValue
    ?? 0;
  const downPayment = (() => { const value = Number(emiDownPayment); return Number.isFinite(value) ? Math.round(value * 100) : 0; })();
  const amountDue = Math.max(0, total - tradeInCredit - (isEmi ? downPayment : 0));
  const priceAdjustment = total - subtotal;

  const setLineOrder = (next: CheckoutLine[]) => {
    orderedLinesRef.current = next;
    setOrderedLines(next);
  };

  const moveLine = (itemId: string, targetId: string): CheckoutLine[] => {
    const current = orderedLinesRef.current;
    const from = current.findIndex((line) => line.id === itemId);
    const to = current.findIndex((line) => line.id === targetId);
    if (from < 0 || to < 0 || from === to) return current;
    const container = cartLinesRef.current;
    if (container) {
      const positions = new Map<string, DOMRect>();
      for (const element of container.querySelectorAll<HTMLElement>(
        "[data-cart-line-id]",
      )) {
        const id = element.dataset.cartLineId;
        if (!id) continue;
        lineAnimationsRef.current.get(id)?.cancel();
        positions.set(id, element.getBoundingClientRect());
      }
      previousLinePositionsRef.current = positions;
    }
    const next = [...current];
    const [moved] = next.splice(from, 1);
    if (!moved) return current;
    next.splice(to, 0, moved);
    setLineOrder(next);
    return next;
  };

  const lineAtPointer = (clientY: number): string | null => {
    const container = cartLinesRef.current;
    if (!container) return null;
    const elements = [
      ...container.querySelectorAll<HTMLElement>("[data-cart-line-id]"),
    ];
    if (elements.length === 0) return null;

    // Use normal layout heights rather than transformed rectangles. During a
    // FLIP animation, visual rectangles overlap and can otherwise trigger an
    // immediate reverse swap while the pointer has not moved.
    let top = container.getBoundingClientRect().top;
    for (const element of elements) {
      const id = element.dataset.cartLineId;
      const midpoint = top + element.offsetHeight / 2;
      if (clientY < midpoint) return id ?? null;
      top += element.offsetHeight;
    }
    return elements.at(-1)?.dataset.cartLineId ?? null;
  };

  const saveLineOrder = (next: CheckoutLine[]) => {
    const unchanged = next.every((line, index) => lines[index]?.id === line.id);
    if (unchanged) return;
    const data = new FormData();
    data.set("cartId", cart.id);
    data.set("orderedItemIds", JSON.stringify(next.map((line) => line.id)));
    startReordering(async () => {
      const state = await reorderCartItemsAction(data);
      setReorderState(state);
      if (state.error) setLineOrder(lines);
    });
  };

  const moveLineByKeyboard = (itemId: string, direction: -1 | 1) => {
    const current = orderedLinesRef.current;
    const index = current.findIndex((line) => line.id === itemId);
    const target = current[index + direction];
    if (index < 0 || !target) return;
    saveLineOrder(moveLine(itemId, target.id));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
      <section>
        <Card className="mb-4 p-4">
          <p className="eyebrow mb-4">{t("checkout.addItems")}</p>
          <form action={addAction}>
            <input type="hidden" name="cartId" value={cart.id} />
            <Field
              label={
                <HelpTerm description={t("term.trackingHelp")}>
                  {t("checkout.scanItem")}
                </HelpTerm>
              }
              hint={t("checkout.scanHint")}
            >
              <ScannerInput
                name="identifier"
                autoFocus
                autoComplete="off"
                defaultValue={initialIdentifier}
                placeholder={t("checkout.scanPlaceholder")}
              />
            </Field>
            <Button className="mt-3" type="submit" disabled={adding}>
              {adding ? t("checkout.adding") : t("checkout.addScanned")}
            </Button>
          </form>
          <div className="my-4 border-t border-rule" />
          <div className="grid gap-4 sm:grid-cols-2">
            <form action={addAction}>
              <input type="hidden" name="cartId" value={cart.id} />
              <Field
                label={t("checkout.bulkProduct")}
                hint={t("checkout.manualAlternative")}
              >
                <Select name="productId" defaultValue="">
                  <option value="" disabled>
                    {t("stock.chooseProduct")}
                  </option>
                  {quantityProducts.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      disabled={product.onHand <= 0}
                    >
                      {product.sku} — {product.name} ({product.onHand})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="mt-3" type="submit" variant="ghost">
                {t("products.add")}
              </Button>
            </form>
            <form action={addAction}>
              <input type="hidden" name="cartId" value={cart.id} />
              <Field
                label={t("checkout.serialItem")}
                hint={t("checkout.chooseExact")}
              >
                <Select name="unitId" defaultValue="">
                  <option value="" disabled>
                    {t("checkout.chooseDevice")}
                  </option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.serialNo} — {unit.sku} — {unit.productName}{unit.usedGrade ? ` — ${unit.usedGrade.replace('GRADE_', 'Grade ')}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="mt-3" type="submit" variant="ghost">
                {t("checkout.addUnit")}
              </Button>
            </form>
          </div>
          <Message state={addState} />
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <p className="eyebrow">
              {t("checkout.cart", {
                count: orderedLines.length,
                kind: t(
                  orderedLines.length === 1
                    ? "checkout.line"
                    : "checkout.lines",
                ),
              })}
            </p>
            <DiscardDraftControl
              cartId={cart.id}
              itemCount={orderedLines.length}
            />
          </div>
          {orderedLines.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-graphite">
              {t("checkout.empty")}
            </p>
          ) : (
            <div ref={cartLinesRef}>
              {orderedLines.map((line) => (
                <CartLineEditor
                  key={line.id}
                  cartId={cart.id}
                  line={line}
                  dragging={draggingId === line.id}
                  dragDisabled={
                    orderedLines.length < 2 || reordering || lineUpdatesPending
                  }
                  onPendingChange={handleLinePending}
                  onValidityChange={handleLineValidity}
                  staffMinimumPrice={role === 'STAFF'
                    ? Math.max(0, line.listUnitPrice - line.staffMaxDiscount)
                    : null}
                  isEmi={isEmi}
                  dragProps={{
                    "aria-label": t("checkout.reorderItem", {
                      product: line.productName,
                    }),
                    title: t("checkout.dragToReorder"),
                    onPointerDown: (event) => {
                      if (
                        orderedLines.length < 2 ||
                        reordering ||
                        lineUpdatesPending ||
                        event.button !== 0 ||
                        (event.target as HTMLElement).closest(
                          "input, button, select, textarea, a, label",
                        )
                      )
                        return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      draggingIdRef.current = line.id;
                      setDraggingId(line.id);
                      setReorderState({});
                    },
                    onPointerMove: (event) => {
                      const activeId = draggingIdRef.current;
                      if (!activeId) return;
                      const target = lineAtPointer(event.clientY);
                      if (target) moveLine(activeId, target);
                    },
                    onPointerUp: (event) => {
                      if (!draggingIdRef.current) return;
                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      ) {
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      }
                      draggingIdRef.current = null;
                      setDraggingId(null);
                      saveLineOrder(orderedLinesRef.current);
                    },
                    onPointerCancel: () => {
                      draggingIdRef.current = null;
                      setDraggingId(null);
                      setLineOrder(lines);
                    },
                    onKeyDown: (event) => {
                      if (
                        orderedLines.length < 2 ||
                        reordering ||
                        lineUpdatesPending ||
                        event.target !== event.currentTarget
                      )
                        return;
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveLineByKeyboard(line.id, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveLineByKeyboard(line.id, 1);
                      }
                    },
                  }}
                />
              ))}
            </div>
          )}
          {(reorderState.error || reorderState.ok) && (
            <div className="border-t border-rule px-4 pb-3">
              <Message state={reorderState} />
            </div>
          )}
        </Card>
      </section>

      <aside>
        <form action={detailAction}>
          <input type="hidden" name="cartId" value={cart.id} />
          <input type="hidden" name="idempotencyKey" value={checkoutKey} />
          <Card className="p-4">
            <p className="eyebrow mb-4">{t("checkout.customerPayment")}</p>
            <div className="space-y-4">
              <Field label={t("checkout.saleType")}>
                <Select name="saleMode" value={saleMode} onChange={(event) => setSaleMode(event.target.value as "CASH" | "EMI")}>
                  <option value="CASH">{t("checkout.regularSale")}</option>
                  <option value="EMI">{t("checkout.shopManagedEmi")}</option>
                </Select>
              </Field>
              <Field
                label={t("common.customer")}
                hint={t("checkout.customerHint")}
              >
                <Input
                  className="mb-2"
                  type="search"
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder={t("checkout.filterCustomer")}
                  aria-label={t("checkout.filterCustomer")}
                />
                <Select name="customerId" value={selectedCustomerId} onChange={(event) => chooseCustomer(event.target.value)}>
                  <option value="">{t("checkout.walkIn")}</option>
                  {visibleCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone ? ` — ${customer.phone}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              {isEmi && (
                <div className="rounded-[3px] border border-blue-300 bg-blue-50/60 p-4">
                  <p className="mb-3 text-[13px] font-semibold">{t("checkout.emiPlan")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("checkout.term")} error={emiErrors.termMonths ? message(emiErrors.termMonths) : undefined}>
                      <Select name="emiTermMonths" value={emiTerm} onChange={(event) => { setEmiTerm(Number(event.target.value) as 3 | 6 | 9 | 12); clearEmiError('termMonths'); }}>
                        {[3, 6, 9, 12].map((term) => <option key={term} value={term}>{t("checkout.months", { count: term })}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("checkout.optionalDownPayment")} error={emiErrors.downPayment ? message(emiErrors.downPayment) : undefined}>
                      <Input name="emiDownPayment" inputMode="numeric" step="1" value={emiDownPayment} onChange={(event) => { setEmiDownPayment(event.target.value); clearEmiError('downPayment'); }} placeholder="0" />
                    </Field>
                    <Field label={t("checkout.firstInstallmentDate")} hint={t("checkout.firstInstallmentHint")} error={emiErrors.firstDueDate ? message(emiErrors.firstDueDate) : undefined}>
                      <Input name="emiFirstDueDate" type="date" min={today} max={maxEmiDueDate} value={emiFirstDueDate} onChange={(event) => { setEmiFirstDueDate(event.target.value); clearEmiError('firstDueDate'); }} />
                    </Field>
                    <Field label={t("checkout.identificationType")} error={emiErrors.identificationType ? message(emiErrors.identificationType) : undefined}>
                      <Select name="identificationType" value={identificationType} onChange={(event) => { setIdentificationType(event.target.value as typeof identificationType); clearEmiError('identificationType'); }}>
                        <option value="">{t("checkout.chooseIdentification")}</option>
                        <option value="NID">{t("checkout.nid")}</option>
                        <option value="PASSPORT">{t("checkout.passport")}</option>
                        <option value="BIRTH_CERTIFICATE">{t("checkout.birthCertificate")}</option>
                      </Select>
                    </Field>
                    <Field label={t("checkout.identificationNumber")} error={emiErrors.identificationNumber ? message(emiErrors.identificationNumber) : undefined}>
                      <Input name="identificationNumber" value={identificationNumber} onChange={(event) => { setIdentificationNumber(event.target.value); clearEmiError('identificationNumber'); }} placeholder={t("checkout.documentNumberPlaceholder")} />
                    </Field>
                  </div>
                  {!selectedCustomerId && <p className="mt-2 text-[12px] text-out">{t("checkout.savedCustomerRequiredForEmi")}</p>}
                  <p className="mt-2 text-[12px] text-graphite">{t("checkout.emiPriceHelp")}</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label={isEmi ? t("checkout.downPaymentMethod") : t("checkout.paymentMethod")}>
                  <Select
                    name="paymentMethod"
                    defaultValue={cart.paymentMethod}
                  >
                    {(
                      [
                        "CASH",
                        "CARD",
                        "MOBILE_BANKING",
                        "BANK_TRANSFER",
                        "MIXED",
                        "OTHER",
                      ] as PaymentMethod[]
                    ).map((value) => (
                      <option key={value} value={value}>
                        {domainLabel(t, value)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {isEmi
                  ? <input type="hidden" name="paymentStatus" value="UNPAID" />
                  : <Field label={t("checkout.paymentStatus")}>
                      <Select name="paymentStatus" defaultValue={cart.paymentStatus}>
                        {(["PAID", "UNPAID"] as PaymentStatus[]).map((value) => (
                          <option key={value} value={value}>{domainLabel(t, value)}</option>
                        ))}
                      </Select>
                    </Field>}
              </div>
              {role === "STAFF" ? (
                <input type="hidden" name="tradeInAcquisitionId" value="" />
              ) : cart.tradeInDraft ? (
                <div>
                  <p className="eyebrow mb-1.5">{t("checkout.tradeInCredit")}</p>
                  <p className="mb-2 text-[11px] text-graphite">{t("checkout.tradeInDraftHelp")}</p>
                  <input type="hidden" name="tradeInAcquisitionId" value="" />
                  <div className="rounded-[3px] border border-rule bg-plate/30 p-3 text-[12px]">
                    <p className="font-semibold">{tradeInProduct?.name ?? t("common.product")} · <span className="tnum">{cart.tradeInDraft.serialNo}</span></p>
                    <p className="mt-1 text-graphite">{cart.tradeInDraft.sellerName} · {formatBDT(cart.tradeInDraft.acquisitionValue)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/stock/used-intake?cart=${cart.id}`} className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[13px] hover:bg-plate">
                        {t("checkout.editTradeIn")}
                      </Link>
                      <Button type="button" variant="danger" onClick={() => setConfirmingTradeInRemoval(true)} disabled={clearingTradeIn}>
                        {t("checkout.removeTradeIn")}
                      </Button>
                    </div>
                  </div>
                  <Message state={clearTradeInState} />
                </div>
              ) : (
                <div>
                  <p className="eyebrow mb-1.5">{t("checkout.tradeInCredit")}</p>
                  <p className="mb-2 text-[11px] text-graphite">{t("checkout.tradeInHelp")}</p>
                  <Link href={`/stock/used-intake?cart=${cart.id}`} className="mb-2 inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[13px] font-medium hover:bg-plate">
                    {t("checkout.prepareTradeIn")}
                  </Link>
                  <input type="hidden" name="tradeInAcquisitionId" value="" />
                </div>
              )}
              <Field label={t("common.reference")}>
                <Input
                  name="reference"
                  defaultValue={cart.reference ?? ""}
                  maxLength={100}
                />
              </Field>
              <Field label={t("checkout.invoiceNote")}>
                <Textarea name="note" defaultValue={cart.note ?? ""} rows={3} />
              </Field>
            </div>

            <div className="my-5 border-t border-rule" />
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt>{t("checkout.listSubtotal")}</dt>
                <dd className="tnum">{formatBDT(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("checkout.priceAdjustment")}</dt>
                <dd className={`tnum font-medium ${priceAdjustment > 0 ? "text-ok" : priceAdjustment < 0 ? "text-out" : "text-graphite"}`}>
                  {priceAdjustment > 0 ? "+" : ""}{formatBDT(priceAdjustment)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold">
                <dt>{isEmi ? t("emi.total") : t("common.total")}</dt>
                <dd className="tnum">{formatBDT(total)}</dd>
              </div>
              {tradeInCredit > 0 && (
                <>
                  <div className="flex justify-between text-[13px] text-out">
                    <dt>{t("checkout.tradeInCredit")}</dt>
                    <dd className="tnum">−{formatBDT(tradeInCredit)}</dd>
                  </div>
                  {!isEmi && <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold">
                    <dt>{t("checkout.amountDue")}</dt>
                    <dd className="tnum">{formatBDT(amountDue)}</dd>
                  </div>}
                </>
              )}
              {isEmi && downPayment > 0 && (
                <div className="flex justify-between text-[13px] text-out">
                  <dt>{t("checkout.downPayment")}</dt><dd className="tnum">−{formatBDT(downPayment)}</dd>
                </div>
              )}
              {isEmi && (
                <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold">
                  <dt>{t("checkout.financedBalance")}</dt><dd className="tnum">{formatBDT(amountDue)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 grid gap-2">
              <Button
                type="submit"
                variant="ghost"
                disabled={saving || checkingOut}
              >
                {saving ? t("common.saving") : t("checkout.saveDraft")}
              </Button>
              <Button
                type="button"
                onClick={requestCheckoutConfirmation}
                disabled={
                  checkingOut ||
                  lineUpdatesPending ||
                  hasInvalidLines ||
                  orderedLines.length === 0 ||
                  !checkoutKey ||
                  (isEmi && !selectedCustomerId)
                }
              >
                {checkingOut
                  ? t("checkout.completing")
                  : t("checkout.complete")}
              </Button>
            </div>
            {lineUpdatesPending && (
              <p className="mt-2 text-[11px] font-medium text-signal">
                {t("checkout.waitForLineSave")}
              </p>
            )}
            {hasInvalidLines && (
              <p className="mt-2 text-[11px] font-medium text-out">
                {t('checkout.fixInvalidLines')}
              </p>
            )}
            <Message
              state={checkoutState.error ? checkoutState : detailState}
            />
            <p className="mt-3 text-[11px] text-graphite">
              {t("checkout.transactionHelp")}
            </p>

            {confirmingTradeInRemoval && cart.tradeInDraft && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !clearingTradeIn) {
                    setConfirmingTradeInRemoval(false);
                  }
                }}
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="remove-trade-in-title"
                  aria-describedby="remove-trade-in-description"
                  className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl"
                >
                  <h2 id="remove-trade-in-title" className="text-[17px] font-semibold">
                    {t("checkout.removeTradeInTitle")}
                  </h2>
                  <p id="remove-trade-in-description" className="mt-2 text-[13px] text-graphite">
                    {t("checkout.removeTradeInDescription")}
                  </p>
                  <p className="mt-3 rounded-[3px] border border-rule bg-plate/30 p-3 text-[12px]">
                    <span className="font-semibold">{tradeInProduct?.name ?? t("common.product")}</span>
                    <span className="tnum ml-2">{cart.tradeInDraft.serialNo}</span>
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setConfirmingTradeInRemoval(false)} disabled={clearingTradeIn}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" variant="danger" formAction={clearTradeInAction} disabled={clearingTradeIn}>
                      {clearingTradeIn ? t("common.saving") : t("checkout.yesRemoveTradeIn")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {confirmingCheckout && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !checkingOut) {
                    setConfirmingCheckout(false);
                  }
                }}
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="complete-sale-title"
                  aria-describedby="complete-sale-description"
                  className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl"
                >
                  <h2
                    id="complete-sale-title"
                    className="text-[16px] font-semibold"
                  >
                    {t("checkout.confirmTitle")}
                  </h2>
                  <p
                    id="complete-sale-description"
                    className="mt-2 text-[13px] text-graphite"
                  >
                    {t("checkout.confirmDescription", {
                      count: orderedLines.length,
                      kind: t(
                        orderedLines.length === 1
                          ? "checkout.line"
                          : "checkout.lines",
                      ),
                      total: formatBDT(total),
                    })}
                  </p>
                  {tradeInCredit > 0 && (
                    <p className="mt-2 text-[12px] text-graphite">
                      {t("checkout.tradeInConfirmation", {
                        credit: formatBDT(tradeInCredit),
                        due: formatBDT(amountDue),
                      })}
                    </p>
                  )}
                  <p className="mt-2 text-[12px] text-out">
                    {t("checkout.cannotUndo")}
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingCheckout(false)}
                      disabled={checkingOut}
                      autoFocus
                    >
                      {t("checkout.keepEditing")}
                    </Button>
                    <Button
                      type="submit"
                      formAction={completeAction}
                      disabled={checkingOut || lineUpdatesPending || hasInvalidLines}
                    >
                      {checkingOut
                        ? t("checkout.completing")
                        : t("checkout.yesComplete")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </form>

        <details className="mt-4 rounded-[3px] border border-rule bg-card">
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">
            {t("checkout.newCustomer")}
          </summary>
          <div className="border-t border-rule p-4">
            <CreateCustomerForm cartId={cart.id} stacked />
          </div>
        </details>
      </aside>
    </div>
  );
}
