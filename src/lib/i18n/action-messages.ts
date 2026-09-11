import type { Locale } from '@/lib/i18n/config';

const bnMessages: Record<string, string> = {
  "The selected parent category is unavailable.": "নির্বাচিত মূল ক্যাটাগরিটি উপলভ্য নয়।",
  "Enter a name.": "একটি নাম লিখুন।",
  "Use 100 characters or fewer.": "সর্বোচ্চ ১০০ অক্ষর ব্যবহার করুন।",
  "Include at least one letter or number.": "অন্তত একটি বর্ণ বা সংখ্যা লিখুন।",
  "This name already exists.": "এই নামটি আগে থেকেই আছে।",
  "This name belongs to a removed record. Restore it instead.": "এই নামের রেকর্ডটি সরানো হয়েছে। সেটি পুনরুদ্ধার করুন।",
  "Category created.": "ক্যাটাগরি তৈরি হয়েছে।",
  "Brand created.": "ব্র্যান্ড তৈরি হয়েছে।",

  'Enter a product code.': 'পণ্যের কোড লিখুন।',
  'Enter a product name.': 'পণ্যের নাম লিখুন।',
  'Choose a category.': 'একটি ক্যাটাগরি বেছে নিন।',
  'Enter a valid amount with at most two decimal places.': 'সর্বোচ্চ দুই দশমিক ঘরসহ সঠিক পরিমাণ লিখুন।',
  'Enter a whole number of zero or more.': 'শূন্য বা তার বেশি একটি পূর্ণসংখ্যা লিখুন।',

  'Enter a valid actual sale date and time.': 'প্রকৃত বিক্রয়ের সঠিক তারিখ ও সময় লিখুন।',
  'Only Admins and Managers can record an earlier sale.': 'শুধু অ্যাডমিন ও ম্যানেজার আগে সম্পন্ন হওয়া বিক্রয় রেকর্ড করতে পারবেন।',
  'The actual sale time cannot be in the future.': 'প্রকৃত বিক্রয়ের সময় ভবিষ্যতে হতে পারবে না।',
  'The actual sale time must be within the last seven days.': 'প্রকৃত বিক্রয়ের সময় গত সাত দিনের মধ্যে হতে হবে।',
  'This checkout request used a different sale time. Start a fresh checkout.': 'এই চেকআউট অনুরোধে অন্য বিক্রয়ের সময় ছিল। নতুন চেকআউট শুরু করুন।',
  'First installment date must be on the sale date or within the following 31 days.': 'প্রথম কিস্তির তারিখ বিক্রয়ের দিন অথবা তার পরবর্তী ৩১ দিনের মধ্যে হতে হবে।',

  'Enter a discount greater than zero. Use Record payment for a payoff without a discount.': 'শূন্যের বেশি ছাড় লিখুন। ছাড় ছাড়া সম্পূর্ণ পরিশোধের জন্য পেমেন্ট রেকর্ড করুন ব্যবহার করুন।',
  'This request key belongs to a different EMI payment. Refresh and try again.': 'এই অনুরোধটি অন্য EMI পেমেন্টের সঙ্গে যুক্ত। রিফ্রেশ করে আবার চেষ্টা করুন।',
  'A record with this name already exists.': 'এই নামে একটি রেকর্ড ইতিমধ্যে আছে।',
  'Item added to the draft cart.': 'পণ্যটি খসড়া কার্টে যোগ হয়েছে।',
  'Cart line updated.': 'কার্টের পণ্য হালনাগাদ হয়েছে।',
  'Cart order saved.': 'কার্টের পণ্যের ক্রম সংরক্ষণ হয়েছে।',
  'Item removed.': 'পণ্যটি সরানো হয়েছে।',
  'Draft discarded. A fresh empty draft is ready.': 'খসড়াটি বাতিল করা হয়েছে। একটি নতুন খালি খসড়া প্রস্তুত।',
  'Checkout details saved.': 'চেকআউটের তথ্য সংরক্ষণ করা হয়েছে।',
  'Supplier updated.': 'সরবরাহকারীর তথ্য হালনাগাদ হয়েছে।',
  'Category updated.': 'ক্যাটাগরি হালনাগাদ হয়েছে।',
  'Category removed.': 'ক্যাটাগরি সরানো হয়েছে।',
  'Category restored.': 'ক্যাটাগরি পুনরুদ্ধার হয়েছে।',
  'Brand updated.': 'ব্র্যান্ড হালনাগাদ হয়েছে।',
  'Brand removed.': 'ব্র্যান্ড সরানো হয়েছে।',
  'Brand restored.': 'ব্র্যান্ড পুনরুদ্ধার হয়েছে।',
  'Note added.': 'নোট যোগ করা হয়েছে।',
  'Claim updated.': 'ক্লেইম হালনাগাদ হয়েছে।',
  'Custody handover recorded.': 'হস্তান্তরের তথ্য রেকর্ড করা হয়েছে।',
  'Stock resolution recorded.': 'স্টক সমাধানের তথ্য রেকর্ড করা হয়েছে।',
  'Supplier warranty case updated.': 'সরবরাহকারীর ওয়ারেন্টি কেস হালনাগাদ হয়েছে।',
  'Reversed. The original entry is still in the ledger, with the correction beneath it.': 'রিভার্স করা হয়েছে। মূল এন্ট্রিটি লেজারে আছে এবং তার নিচে সংশোধনী এন্ট্রি যোগ হয়েছে।',
  'Invalid input.': 'দেওয়া তথ্য সঠিক নয়।',
  'Something went wrong.': 'কোনো সমস্যা হয়েছে।',
  'The stock removal could not be completed. Please try again or contact an administrator.': 'স্টক অপসারণ সম্পন্ন করা যায়নি। আবার চেষ্টা করুন অথবা অ্যাডমিনের সঙ্গে যোগাযোগ করুন।',
  'Product not found.': 'পণ্য পাওয়া যায়নি।',
  "The selected product is no longer active.": "নির্বাচিত পণ্যটি আর সক্রিয় নেই।",
  "The selected supplier is no longer active.": "নির্বাচিত সরবরাহকারী আর সক্রিয় নেই।",
  "The product tracking method changed. Refresh and review this receipt.": "পণ্যের ট্র্যাকিং পদ্ধতি বদলেছে। রিফ্রেশ করে রসিদ যাচাই করুন।",
  "This receipt key belongs to a different receiving request.": "এই রসিদের চাবিটি অন্য একটি স্টক গ্রহণের অনুরোধের সঙ্গে যুক্ত।",
  "This receipt is already recorded. Check the movement ledger before receiving again.": "এই রসিদ ইতিমধ্যে রেকর্ড হয়েছে। আবার গ্রহণের আগে মুভমেন্ট লেজার যাচাই করুন।",
  "Stock changed during this request. Retry the same receipt.": "এই অনুরোধের সময় স্টক পরিবর্তিত হয়েছে। একই রসিদ দিয়ে আবার চেষ্টা করুন।",
  "Invalid device-number check request.": "ডিভাইস নম্বর যাচাইয়ের অনুরোধটি সঠিক নয়।",
  "The selected serialized product is unavailable.": "নির্বাচিত স্বতন্ত্রভাবে ট্র্যাক করা পণ্যটি উপলব্ধ নেই।",
  'Product not found': 'পণ্য পাওয়া যায়নি।',
  'Supplier not found': 'সরবরাহকারী পাওয়া যায়নি।',
  'Category not found': 'ক্যাটাগরি পাওয়া যায়নি।',
  'Brand not found': 'ব্র্যান্ড পাওয়া যায়নি।',
  'Draft cart not found.': 'খসড়া কার্ট পাওয়া যায়নি।',
  'Cart item not found.': 'কার্টের পণ্য পাওয়া যায়নি।',
  'Invoice not found.': 'ইনভয়েস পাওয়া যায়নি।',
  'Invoice voided. Inventory and financial records were reversed together.': 'ইনভয়েস বাতিল হয়েছে। স্টক ও আর্থিক রেকর্ড একসঙ্গে বিপরীত এন্ট্রি দিয়ে সমন্বয় করা হয়েছে।',
  'Enter the amount received.': 'প্রাপ্ত টাকার পরিমাণ লিখুন।',
  'Choose the payment method.': 'পরিশোধের মাধ্যম নির্বাচন করুন।',
  'Review the payment details.': 'পরিশোধের তথ্যগুলো যাচাই করুন।',
  'This payment request is already bound to another invoice. Refresh and try again.': 'এই পরিশোধের অনুরোধটি অন্য একটি ইনভয়েসের সঙ্গে যুক্ত। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
  'The invoice for this receipt no longer exists.': 'এই রসিদের ইনভয়েসটি আর পাওয়া যাচ্ছে না।',
  'Payments cannot be recorded against a voided invoice.': 'বাতিল ইনভয়েসে পরিশোধ রেকর্ড করা যাবে না।',
  'Use the EMI contract to record installment payments.': 'কিস্তির পরিশোধ রেকর্ড করতে EMI চুক্তি ব্যবহার করুন।',
  'This invoice is already fully paid.': 'এই ইনভয়েসের সম্পূর্ণ টাকা ইতিমধ্যে পরিশোধ করা হয়েছে।',
  'The received amount cannot exceed the invoice due amount.': 'প্রাপ্ত টাকা ইনভয়েসের বকেয়া টাকার বেশি হতে পারবে না।',
  'The invoice payment changed. Refresh and try again.': 'ইনভয়েসের পরিশোধের তথ্য পরিবর্তিত হয়েছে। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
  'The payment could not be recorded.': 'পরিশোধটি রেকর্ড করা যায়নি।',
  'The invoice changed during this request. Refresh and try again.': 'অনুরোধ চলাকালে ইনভয়েসটি পরিবর্তিত হয়েছে। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
  'This invoice has already been voided.': 'এই ইনভয়েসটি ইতিমধ্যে বাতিল করা হয়েছে।',
  'An EMI invoice cannot be voided after installment collection has started.': 'কিস্তি সংগ্রহ শুরু হওয়ার পর EMI ইনভয়েস বাতিল করা যাবে না।',
  'Choose how the customer was refunded.': 'ক্রেতাকে কীভাবে টাকা ফেরত দেওয়া হয়েছে তা নির্বাচন করুন।',
  'This invoice has no sale lines and cannot be voided safely.': 'এই ইনভয়েসে কোনো বিক্রয় লাইন নেই, তাই নিরাপদে বাতিল করা যাবে না।',
  'This invoice is no longer eligible to be voided.': 'এই ইনভয়েসটি আর বাতিল করার উপযুক্ত নয়।',
  'The reason must not exceed 1000 characters.': 'কারণটি সর্বোচ্চ ১০০০ অক্ষরের হতে পারবে।',
  'Confirm that you verified the invoice, refund, and physical items.': 'ইনভয়েস, ফেরত টাকা ও পণ্য যাচাই করেছেন বলে নিশ্চিত করুন।',
  'The selected customer is unavailable.': 'নির্বাচিত ক্রেতাকে পাওয়া যাচ্ছে না।',
  'The selected category is unavailable.': 'নির্বাচিত ক্যাটাগরিটি ব্যবহার করা যাচ্ছে না।',
  'The selected brand is unavailable.': 'নির্বাচিত ব্র্যান্ডটি ব্যবহার করা যাচ্ছে না।',
  'Add at least one item before checkout.': 'চেকআউটের আগে কমপক্ষে একটি পণ্য যোগ করুন।',
  'No product or device number matches that identifier.': 'এই পরিচয় নম্বরের সঙ্গে মেলে এমন কোনো পণ্য বা ডিভাইস নম্বর পাওয়া যায়নি।',
  'A customer with this phone number already exists.': 'এই ফোন নম্বরে একজন ক্রেতা ইতিমধ্যে আছেন।',
  'Could not save the category': 'বিভাগ সংরক্ষণ করা যায়নি।',
  'Could not save the brand': 'ব্র্যান্ড সংরক্ষণ করা যায়নি।',
  'Could not save the supplier': 'সরবরাহকারী সংরক্ষণ করা যায়নি।',
  'Could not update the supplier': 'সরবরাহকারীর তথ্য হালনাগাদ করা যায়নি।',
  'Could not update the category': 'ক্যাটাগরি হালনাগাদ করা যায়নি।',
  'Could not update the brand': 'ব্র্যান্ড হালনাগাদ করা যায়নি।',
  'Could not change the category status': 'ক্যাটাগরির অবস্থা পরিবর্তন করা যায়নি।',
  'Could not change the brand status': 'ব্র্যান্ডের অবস্থা পরিবর্তন করা যায়নি।',
  'Move or archive active products before removing this category.': 'এই ক্যাটাগরি সরানোর আগে সক্রিয় পণ্যগুলো অন্য ক্যাটাগরিতে নিন অথবা আর্কাইভ করুন।',
  'Move or remove active child categories before removing this category.': 'এই ক্যাটাগরি সরানোর আগে সক্রিয় উপ-ক্যাটাগরিগুলো সরান বা অন্যত্র নিন।',
  'Move or archive active products before removing this brand.': 'এই ব্র্যান্ড সরানোর আগে সক্রিয় পণ্যগুলো অন্য ব্র্যান্ডে নিন অথবা আর্কাইভ করুন।',
  'Could not save the product': 'পণ্য সংরক্ষণ করা যায়নি।',
  'Could not create the user': 'ব্যবহারকারী তৈরি করা যায়নি।',
  'Invalid mobile number or password': 'মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।',
  'Enter a valid Bangladeshi mobile number': 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।',
  'This mobile number already belongs to a user.': 'এই মোবাইল নম্বরটি ইতিমধ্যে একজন ব্যবহারকারীর।',
  'Mobile number updated.': 'মোবাইল নম্বর হালনাগাদ হয়েছে।',
  'Passwords do not match': 'পাসওয়ার্ড দুটি মেলেনি।',
  'Use at least 12 characters': 'অন্তত ১২টি অক্ষর ব্যবহার করুন।',
  'Enter your current password': 'বর্তমান পাসওয়ার্ড লিখুন।',
  'Current password is incorrect.': 'বর্তমান পাসওয়ার্ড সঠিক নয়।',
  'Password changed. Your other sessions were signed out.': 'পাসওয়ার্ড পরিবর্তন হয়েছে। আপনার অন্য সেশনগুলো সাইন আউট করা হয়েছে।',
  'Use Settings to change your own password.': 'নিজের পাসওয়ার্ড পরিবর্তন করতে সেটিংস ব্যবহার করুন।',
  'Temporary password set. The user’s other sessions were revoked.': 'অস্থায়ী পাসওয়ার্ড সেট হয়েছে। ব্যবহারকারীর অন্য সেশনগুলো বাতিল করা হয়েছে।',
  'The selected unit list is invalid. Reload the page and try again.': 'নির্বাচিত পণ্যের তালিকা সঠিক নয়। পেজটি পুনরায় লোড করে আবার চেষ্টা করুন।',
  'Invalid label print request.': 'লেবেল প্রিন্টের অনুরোধ সঠিক নয়।',
  'Select at least one individually tracked item.': 'কমপক্ষে একটি সিরিয়ালভিত্তিক পণ্য নির্বাচন করুন।',
  'A print job may contain at most 500 labels.': 'একবারে সর্বোচ্চ ৫০০টি লেবেল প্রিন্ট করা যাবে।',
  'One or more selected units do not belong to this product.': 'নির্বাচিত এক বা একাধিক পণ্য এই পণ্যের অন্তর্ভুক্ত নয়।',
  'STAFF may only print labels for units currently in stock.': 'স্টাফ শুধু বর্তমানে স্টকে থাকা সিরিয়ালভিত্তিক পণ্যের লেবেল প্রিন্ট করতে পারবেন।',
  'STAFF may only print labels for products currently in stock.': 'স্টাফ শুধু বর্তমানে স্টকে থাকা পণ্যের লেবেল প্রিন্ট করতে পারবেন।',
  'Enter a device number or IMEI': 'ডিভাইস নম্বর বা IMEI লিখুন।',
  'Use Checkout for every sale so an invoice and complete sale record are created.': 'প্রতিটি বিক্রয়ের জন্য চেকআউট ব্যবহার করুন, যাতে ইনভয়েস ও সম্পূর্ণ বিক্রয় রেকর্ড তৈরি হয়।',
  'Refurbishment cost added to this phone.': 'এই ফোনের সঙ্গে মেরামতের খরচ যোগ হয়েছে।',
  'Used-phone details updated.': 'পুরোনো ফোনের তথ্য হালনাগাদ হয়েছে।',
  'Only a Manager or Admin can apply a trade-in credit.': 'শুধু ম্যানেজার বা অ্যাডমিন ট্রেড-ইন ক্রেডিট প্রয়োগ করতে পারেন।',
  'The selected trade-in is unavailable.': 'নির্বাচিত ট্রেড-ইনটি ব্যবহার করা যাচ্ছে না।',
  'The selected trade-in is no longer available.': 'নির্বাচিত ট্রেড-ইনটি আর ব্যবহার করা যাচ্ছে না।',
  'Trade-in credit cannot exceed the sale total in this version.': 'এই সংস্করণে ট্রেড-ইন ক্রেডিট বিক্রয়ের মোট মূল্যের বেশি হতে পারবে না।',
  'Trade-in removed from this checkout.': 'এই চেকআউট থেকে ট্রেড-ইন সরানো হয়েছে।',
  'A checkout cannot use two trade-ins.': 'একটি চেকআউটে দুটি ট্রেড-ইন ব্যবহার করা যাবে না।',
  'Remove the existing legacy trade-in credit before preparing a new trade-in.': 'নতুন ট্রেড-ইন প্রস্তুত করার আগে আগের ট্রেড-ইন ক্রেডিট সরান।',
  'Remove the checkout trade-in draft before selecting a legacy trade-in.': 'আগের ট্রেড-ইন নির্বাচন করার আগে চেকআউটের ট্রেড-ইন খসড়া সরান।',
  'Start a trade-in from Checkout so the credit and sale complete together.': 'ক্রেডিট ও বিক্রয় একসঙ্গে সম্পন্ন করতে চেকআউট থেকে ট্রেড-ইন শুরু করুন।',
  'The IMEI must match the device before acceptance.': 'গ্রহণের আগে IMEI ডিভাইসের সঙ্গে মিলতে হবে।',
  'Remove all account and activation locks before acceptance.': 'গ্রহণের আগে সব অ্যাকাউন্ট ও অ্যাক্টিভেশন লক সরান।',
  'Describe every defective inspection result before acceptance.': 'গ্রহণের আগে পরিদর্শনে পাওয়া প্রতিটি ত্রুটি বর্ণনা করুন।',
  'Grade C and refurbished phones require a defect or repair-history note.': 'গ্রেড C ও মেরামতকৃত ফোনের জন্য ত্রুটি বা মেরামতের ইতিহাস লিখতে হবে।',
  'Enter a valid Bangladeshi mobile number, such as 01712345678 or +8801712345678.': 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন, যেমন 01712345678 বা +8801712345678।',
  'Enter a customer name.': 'ক্রেতার নাম লিখুন।',
  'Customer name must be 150 characters or fewer.': 'ক্রেতার নাম সর্বোচ্চ ১৫০ অক্ষরের হতে হবে।',
  'A mobile number is required.': 'মোবাইল নম্বর লিখুন।',
  'Confirm that the seller owns the device.': 'বিক্রেতা যে ডিভাইসটির মালিক তা নিশ্চিত করুন।',
  'Choose either days or months for the warranty.': 'ওয়ারেন্টির জন্য দিন অথবা মাস—যেকোনো একটি বেছে নিন।',
  'Expense category added.': 'ব্যয়ের ক্যাটাগরি যোগ হয়েছে।',
  'Expense category updated.': 'ব্যয়ের ক্যাটাগরি হালনাগাদ হয়েছে।',
  'An expense category with this name already exists.': 'এই নামে একটি ব্যয়ের ক্যাটাগরি ইতিমধ্যে আছে।',
  'Choose an active expense category.': 'একটি সক্রিয় ব্যয়ের ক্যাটাগরি নির্বাচন করুন।',
  'Expense not found.': 'ব্যয়ের রেকর্ড পাওয়া যায়নি।',
  'A voided expense cannot be edited.': 'বাতিল করা ব্যয় সংশোধন করা যাবে না।',
  'This expense is already voided.': 'এই ব্যয়টি ইতিমধ্যে বাতিল করা হয়েছে।',
  'Enter the expense amount.': 'ব্যয়ের পরিমাণ লিখুন।',
  'Enter a valid amount greater than zero.': 'শূন্যের বেশি সঠিক পরিমাণ লিখুন।',
  'Enter an amount greater than zero.': 'শূন্যের বেশি পরিমাণ লিখুন।',
  "Enter a valid calendar date.": "সঠিক ক্যালেন্ডার তারিখ লিখুন।",
  "End date must be on or after start date.": "শেষের তারিখ শুরুর তারিখের আগে হতে পারবে না।",
  "Enter a valid amount.": "সঠিক পরিমাণ লিখুন।",
  "Amount exceeds the supported limit.": "পরিমাণ অনুমোদিত সীমার বেশি।",
  "Maximum amount must be at least the minimum amount.": "সর্বোচ্চ পরিমাণ সর্বনিম্ন পরিমাণের কম হতে পারবে না।",
  "Choose a valid payment method.": "সঠিক পরিশোধের মাধ্যম নির্বাচন করুন।",
  "Choose a valid status.": "সঠিক অবস্থা নির্বাচন করুন।",
  'This record changed while saving. Please try again.': 'সংরক্ষণের সময় রেকর্ডটি পরিবর্তিত হয়েছে। আবার চেষ্টা করুন।',
  'Could not save changes. Please try again.': 'পরিবর্তন সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
  'Choose a valid expense date.': 'সঠিক ব্যয়ের তারিখ নির্বাচন করুন।',
  'Choose an expense category.': 'ব্যয়ের ক্যাটাগরি নির্বাচন করুন।',
  'Describe the expense using at least 3 characters.': 'কমপক্ষে ৩টি অক্ষরে ব্যয়ের বিবরণ লিখুন।',
  'Description must not exceed 300 characters.': 'বিবরণ ৩০০ অক্ষরের বেশি হতে পারবে না।',
  'Choose a payment method.': 'পরিশোধের মাধ্যম নির্বাচন করুন।',
  'Give a clear reason using at least 5 characters.': 'কমপক্ষে ৫টি অক্ষরে স্পষ্ট কারণ লিখুন।',
  'Confirm that this expense should be voided.': 'এই ব্যয়টি বাতিল করতে নিশ্চিত করুন।',
  'Category name must contain at least 2 characters.': 'ক্যাটাগরির নামে কমপক্ষে ২টি অক্ষর থাকতে হবে।',
  'Category name must not exceed 100 characters.': 'ক্যাটাগরির নাম ১০০ অক্ষরের বেশি হতে পারবে না।',
  'Enter the maximum discount STAFF may apply to this product.': 'এই পণ্যে কর্মীরা সর্বোচ্চ কত টাকা ছাড় দিতে পারবেন তা লিখুন।',
  'Enter a valid amount of zero or more.': 'শূন্য বা তার বেশি সঠিক পরিমাণ লিখুন।',
  'The STAFF discount cannot exceed this product’s selling price.': 'কর্মীর ছাড় এই পণ্যের বিক্রয়মূল্যের বেশি হতে পারবে না।',
  'Choose an EMI term.': 'একটি EMI মেয়াদ বেছে নিন।',
  'Use a whole-taka down payment without decimal places.': 'ডাউন পেমেন্টে দশমিক ছাড়া পূর্ণ টাকার পরিমাণ লিখুন।',
  'Choose an identification type.': 'পরিচয়পত্রের ধরন বেছে নিন।',
  'Enter the customer identification number.': 'ক্রেতার পরিচয়পত্র নম্বর লিখুন।',
  'Use a whole-taka payment without decimal places.': 'পেমেন্টে দশমিক ছাড়া পূর্ণ টাকার পরিমাণ লিখুন।',
  'Use a whole-taka discount without decimal places.': 'ছাড়ে দশমিক ছাড়া পূর্ণ টাকার পরিমাণ লিখুন।',
  'EMI installments require a whole-taka financed balance.': 'EMI কিস্তির জন্য অর্থায়িত বকেয়া পূর্ণ টাকায় হতে হবে।',
  'This EMI contract is not open for payments.': 'এই EMI চুক্তিতে এখন পেমেন্ট নেওয়া যাবে না।',
  'Payment must be greater than zero and cannot exceed the outstanding balance.': 'পেমেন্ট শূন্যের বেশি এবং মোট বকেয়ার সমান বা কম হতে হবে।',
  'This EMI contract cannot be settled.': 'এই EMI চুক্তি আগাম নিষ্পত্তি করা যাবে না।',
  'Early settlement has already been applied.': 'আগাম নিষ্পত্তি ইতিমধ্যে প্রয়োগ করা হয়েছে।',
  'Early-settlement discount must be lower than the outstanding balance.': 'আগাম নিষ্পত্তির ছাড় মোট বকেয়ার চেয়ে কম হতে হবে।',
  'Payment recorded successfully.': 'কিস্তির পেমেন্ট সফলভাবে রেকর্ড হয়েছে।',
  'EMI settled early successfully.': 'EMI সফলভাবে আগাম নিষ্পত্তি হয়েছে।',
  'Choose a saved customer for an EMI sale.': 'EMI বিক্রয়ের জন্য সংরক্ষিত একজন ক্রেতা বেছে নিন।',
  'Add the customer identification type and number before an EMI sale.': 'EMI বিক্রয়ের আগে ক্রেতার পরিচয়পত্রের ধরন ও নম্বর যোগ করুন।',
  'Choose a valid EMI term.': 'সঠিক EMI মেয়াদ বেছে নিন।',
  'Choose the first installment date.': 'প্রথম কিস্তির তারিখ বেছে নিন।',
  'First installment date must be today or within the next 31 days.': 'প্রথম কিস্তির তারিখ আজ অথবা পরবর্তী ৩১ দিনের মধ্যে হতে হবে।',
  'Down payment and trade-in credit cannot exceed the EMI total.': 'ডাউন পেমেন্ট ও ট্রেড-ইন ক্রেডিটের যোগফল EMI মোটের বেশি হতে পারবে না।',
  'EMI price, down payment, and trade-in credit must use whole-taka amounts.': 'EMI মূল্য, ডাউন পেমেন্ট ও ট্রেড-ইন ক্রেডিট পূর্ণ টাকার পরিমাণে হতে হবে।',
};

export function translateActionMessage(locale: Locale, value: string): string {
  if (locale === 'en') return value;
  const exact = bnMessages[value];
  if (exact) return exact;

  let match = value.match(/^A record with this (.+) already exists\.$/);
  if (match) return match[1] === 'name' ? 'এই নামে একটি রেকর্ড ইতিমধ্যে আছে।' : 'এই তথ্যসহ একটি রেকর্ড ইতিমধ্যে আছে।';

  match = value.match(/^(.+) created and selected\.$/);
  if (match) return `${match[1]} তৈরি ও নির্বাচন করা হয়েছে।`;
  match = value.match(/^Created (.+)\.$/);
  if (match) return `${match[1]}-কে তৈরি করা হয়েছে।`;
  match = value.match(/^(.+) created\.$/);
  if (match) return `${match[1]} তৈরি করা হয়েছে।`;
  match = value.match(/^Removed (.+)\.$/);
  if (match) return `${match[1]} স্টক থেকে সরানো হয়েছে।`;
  match = value.match(/^Received (.+) × (.+) into stock\.$/);
  if (match) return `${match[2]} পণ্যের ${match[1]}টি স্টকে গ্রহণ করা হয়েছে।`;
  match = value.match(/^That phone number already belongs to (.+)\.$/);
  if (match) return `এই ফোন নম্বরটি ইতিমধ্যে ${match[1]}-এর।`;
  match = value.match(/^Device number (.+) belongs to a different product and cannot be revived here\.$/);
  if (match) return `ডিভাইস নম্বর ${match[1]} অন্য একটি পণ্যের এবং এখানে পুনরায় সক্রিয় করা যাবে না।`;
  match = value.match(/^Accepted (.+) into used-phone inventory\.$/);
  if (match) return `${match[1]} পুরোনো ফোনের স্টকে গ্রহণ করা হয়েছে।`;
  match = value.match(/^Recorded (EXP-.+)\.$/);
  if (match) return `${match[1]} ব্যয় রেকর্ড করা হয়েছে।`;
  match = value.match(/^Updated (EXP-.+)\.$/);
  if (match) return `${match[1]} ব্যয় হালনাগাদ হয়েছে।`;
  match = value.match(/^Voided (EXP-.+)\.$/);
  if (match) return `${match[1]} ব্যয় বাতিল করা হয়েছে।`;
  match = value.match(/^Payment recorded\. Receipt (.+)\.$/);
  if (match) return `পরিশোধ রেকর্ড হয়েছে। রসিদ ${match[1]}।`;
  match = value.match(/^Invoice line (.+) is not linked to a valid sale movement\.$/);
  if (match) return `${match[1]} ইনভয়েস লাইনটি সঠিক বিক্রয় স্টক মুভমেন্টের সঙ্গে যুক্ত নয়।`;
  match = value.match(/^The stock movement for (.+) has already been reversed\.$/);
  if (match) return `${match[1]}-এর স্টক মুভমেন্ট ইতিমধ্যে বিপরীত করা হয়েছে।`;
  match = value.match(/^Device (.+) is no longer in its original sold state\.$/);
  if (match) return `ডিভাইস ${match[1]} আর আগের বিক্রি হওয়া অবস্থায় নেই।`;
  match = value.match(/^Device (.+) has warranty history\. Resolve that workflow before voiding\.$/);
  if (match) return `ডিভাইস ${match[1]}-এর ওয়ারেন্টি ইতিহাস আছে। বাতিল করার আগে সেই কাজটি সম্পন্ন করুন।`;
  match = value.match(/^Device (.+) has later inventory activity and cannot be restored automatically\.$/);
  if (match) return `ডিভাইস ${match[1]}-এর পরবর্তী স্টক কার্যক্রম আছে, তাই স্বয়ংক্রিয়ভাবে ফিরিয়ে আনা যাবে না।`;
  match = value.match(/^STAFF may not sell this item below (.+)\.$/);
  if (match) return `কর্মীরা এই পণ্যটি ${match[1]}-এর কমে বিক্রি করতে পারবেন না।`;
  match = value.match(/^(.+) must be at least (.+) for STAFF\.$/);
  if (match) return `কর্মীদের জন্য ${match[1]}-এর মূল্য কমপক্ষে ${match[2]} হতে হবে।`;

  return value;
}
