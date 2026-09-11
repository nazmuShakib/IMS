import { expenseCategories, expenseFixtures } from '../../../tests/expense-fixtures';
export const categories = expenseCategories.map(c => ({ ...c }));
export const rows = expenseFixtures(60);
rows[1]!.description = 'দোকানের মাসিক ভাড়া এবং রক্ষণাবেক্ষণ — Monthly shop rent and maintenance with a longer description';
rows[1]!.note = 'A retained note / সংরক্ষিত নোট';
