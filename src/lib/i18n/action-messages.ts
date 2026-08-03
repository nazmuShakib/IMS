import type { Locale } from '@/lib/i18n/config';

const bnMessages: Record<string, string> = {
  'A record with this name already exists.': 'এই নামে একটি রেকর্ড ইতিমধ্যে আছে।',
  'Item added to the draft cart.': 'পণ্যটি খসড়া কার্টে যোগ হয়েছে।',
  'Cart line updated.': 'কার্টের পণ্য হালনাগাদ হয়েছে।',
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
  'Product not found.': 'পণ্য পাওয়া যায়নি।',
  'Product not found': 'পণ্য পাওয়া যায়নি।',
  'Supplier not found': 'সরবরাহকারী পাওয়া যায়নি।',
  'Category not found': 'ক্যাটাগরি পাওয়া যায়নি।',
  'Brand not found': 'ব্র্যান্ড পাওয়া যায়নি।',
  'Draft cart not found.': 'খসড়া কার্ট পাওয়া যায়নি।',
  'Cart item not found.': 'কার্টের পণ্য পাওয়া যায়নি।',
  'Invoice not found.': 'ইনভয়েস পাওয়া যায়নি।',
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

  return value;
}
