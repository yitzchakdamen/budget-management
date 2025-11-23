let categoryPieChart;
let incomeExpenseBarChart;
let categories = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchCategories();
    fetchTransactions();

    const monthSelector = document.getElementById('month-selector');
    monthSelector.addEventListener('change', () => {
        const [year, month] = monthSelector.value.split('-');
        fetchMonthlySummary(year, month);
    });

    // Set default to current month
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    monthSelector.value = currentMonth;
    fetchMonthlySummary(today.getFullYear(), today.getMonth() + 1);

    const addCategoryForm = document.getElementById('add-category-form');
    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const categoryName = document.getElementById('new-category-name').value;
        const parentId = document.getElementById('new-category-parent').value;
        await addCategory(categoryName, parentId ? parseInt(parentId) : null);
        addCategoryForm.reset();
    });

    const addTransactionForm = document.getElementById('add-transaction-form');
    addTransactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newTransaction = {
            type: document.getElementById('new-transaction-type').value,
            amount: parseFloat(document.getElementById('new-transaction-amount').value),
            date: document.getElementById('new-transaction-date').value,
            category: parseInt(document.getElementById('new-transaction-category').value) || null,
            description: document.getElementById('new-transaction-description').value,
            notes: document.getElementById('new-transaction-notes').value,
        };
        await addTransaction(newTransaction);
        fetchTransactions();
        addTransactionForm.reset();
    });

    const uploadCsvForm = document.getElementById('upload-csv-form');
    uploadCsvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('csv-file');
        const file = fileInput.files[0];

        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/upload-csv', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            const uploadStatus = document.getElementById('upload-status');

            if (response.ok) {
                uploadStatus.textContent = result.message;
                fetchCategories();
                fetchTransactions();
            } else {
                uploadStatus.textContent = `Error: ${result.message || 'Upload failed'}`;
                if (result.errors) {
                    uploadStatus.innerHTML += `<br><pre>${result.errors.join('\n')}</pre>`;
                }
            }
        }
    });
});

async function fetchCategories() {
    try {
        const response = await fetch('/api/categories');
        categories = await response.json();
    } catch (error) {
        console.error('Error fetching categories:', error);
    }
    const categoriesList = document.getElementById('categories-list');
    categoriesList.innerHTML = '';

    const categoryTree = buildCategoryTree(categories);
    const categoryListElement = createCategoryListElement(categoryTree);
    categoriesList.appendChild(categoryListElement);

    // Populate parent category dropdown
    const parentCategoryDropdown = document.getElementById('new-category-parent');
    parentCategoryDropdown.innerHTML = '<option value="">None (Top-level)</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        parentCategoryDropdown.appendChild(option);
    });

    const categoryDropdown = document.getElementById('new-transaction-category');
    categoryDropdown.innerHTML = '<option value="">Uncategorized</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categoryDropdown.appendChild(option);
    });
}

function buildCategoryTree(categories, parentId = null) {
    const tree = [];
    for (const category of categories) {
        if (category.parent === parentId) {
            const children = buildCategoryTree(categories, category.id);
            if (children.length) {
                category.children = children;
            }
            tree.push(category);
        }
    }
    return tree;
}

function createCategoryListElement(categoryTree) {
    const ul = document.createElement('ul');
    for (const category of categoryTree) {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${category.name}</span>
            <button onclick="editCategory(${category.id})">Edit</button>
            <button onclick="deleteCategory(${category.id})">Delete</button>
        `;
        if (category.children) {
            li.appendChild(createCategoryListElement(category.children));
        }
        ul.appendChild(li);
    }
    return ul;
}

async function fetchTransactions() {
    try {
        const response = await fetch('/api/transactions');
        const transactions = await response.json();
        const transactionsList = document.getElementById('transactions-list');
    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
    transactionsList.innerHTML = '';

    const transactionList = document.createElement('ul');
    transactions.forEach(transaction => {
        const category = categories.find(c => c.id === transaction.category);
        const categoryName = category ? category.name : 'Uncategorized';
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <span>${transaction.date} - ${transaction.type} - ${transaction.amount} - ${transaction.description} - ${categoryName}</span>
            <button onclick="editTransaction(${transaction.id})">Edit</button>
            <button onclick="deleteTransaction(${transaction.id})">Delete</button>
        `;
        transactionList.appendChild(listItem);
    });

    transactionsList.appendChild(transactionList);
}

async function addTransaction(transaction) {
    try {
        await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(transaction),
        });
    } catch (error) {
        console.error('Error adding transaction:', error);
    }
}

async function editTransaction(id) {
    // For simplicity, we'll just re-use the add form's fields
    // A more robust implementation would use a modal or separate form
    const type = prompt('Enter new type (income/expense):');
    const amount = prompt('Enter new amount:');
    const date = prompt('Enter new date (YYYY-MM-DD):');
    const description = prompt('Enter new description:');

    if (type && amount && date && description) {
        try {
            await fetch(`/api/transactions/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ type, amount: parseFloat(amount), date, description }),
            });
            fetchTransactions();
        } catch (error) {
            console.error('Error editing transaction:', error);
        }
    }
}

async function deleteTransaction(id) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        try {
            await fetch(`/api/transactions/${id}`, {
                method: 'DELETE',
            });
            fetchTransactions();
        } catch (error) {
            console.error('Error deleting transaction:', error);
        }
    }
}

async function addCategory(name, parent = null) {
    try {
        await fetch('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, parent }),
        });
        fetchCategories();
    } catch (error) {
        console.error('Error adding category:', error);
    }
}

async function editCategory(id) {
    const newName = prompt('Enter new category name:');
    if (newName) {
        try {
            await fetch(`/api/categories/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName }),
            });
            fetchCategories();
        } catch (error) {
            console.error('Error editing category:', error);
        }
    }
}

async function fetchMonthlySummary(year, month) {
    try {
        const response = await fetch(`/api/monthly-summary?year=${year}&month=${month}`);
        const summary = await response.json();

        const summaryDiv = document.getElementById('monthly-summary');
        summaryDiv.innerHTML = `
            <p>Total Income: ${summary.total_income}</p>
            <p>Total Expenses: ${summary.total_expenses}</p>
        `;

        updateCategoryPieChart(summary.category_breakdown);
        updateIncomeExpenseBarChart(summary);
        updateMonthlyTransactionsTable(summary.transactions);
    } catch (error) {
        console.error('Error fetching monthly summary:', error);
    }
}

function updateCategoryPieChart(categoryBreakdown) {
    const ctx = document.getElementById('category-pie-chart').getContext('2d');
    const labels = Object.keys(categoryBreakdown);
    const data = labels.map(label => categoryBreakdown[label].expense);

    if (categoryPieChart) {
        categoryPieChart.destroy();
    }

    categoryPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
                ],
            }]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: 'Expense Distribution by Category'
            }
        }
    });
}

function updateIncomeExpenseBarChart(summary) {
    const ctx = document.getElementById('income-expense-bar-chart').getContext('2d');

    if (incomeExpenseBarChart) {
        incomeExpenseBarChart.destroy();
    }

    incomeExpenseBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Monthly Totals'],
            datasets: [
                {
                    label: 'Income',
                    data: [summary.total_income],
                    backgroundColor: '#36A2EB',
                },
                {
                    label: 'Expenses',
                    data: [summary.total_expenses],
                    backgroundColor: '#FF6384',
                }
            ]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: 'Income vs. Expenses'
            },
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true
                    }
                }]
            }
        }
    });
}

function updateMonthlyTransactionsTable(transactions) {
    const table = document.getElementById('monthly-transactions');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
                <th>Category</th>
            </tr>
        </thead>
        <tbody>
            ${transactions.map(t => {
                const category = categories.find(c => c.id === t.category);
                const categoryName = category ? category.name : 'Uncategorized';
                return `
                    <tr>
                        <td>${t.date}</td>
                        <td>${t.type}</td>
                        <td>${t.amount}</td>
                        <td>${t.description}</td>
                        <td>${categoryName}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    `;
}

async function deleteCategory(id) {
    if (confirm('Are you sure you want to delete this category?')) {
        try {
            await fetch(`/api/categories/${id}`, {
                method: 'DELETE',
            });
            fetchCategories();
        } catch (error) {
            console.error('Error deleting category:', error);
        }
    }
}
