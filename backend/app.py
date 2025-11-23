from flask import Flask, jsonify, request
import json
from datetime import datetime
import csv
import io
import fcntl

app = Flask(__name__, static_folder='../frontend', static_url_path='')

DATA_FILE = '../data.json'

def read_data():
    with open(DATA_FILE, 'r') as f:
        fcntl.flock(f, fcntl.LOCK_SH)
        try:
            return json.load(f)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

def write_data(data):
    with open(DATA_FILE, 'w') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

def get_next_id(items):
    return max([item['id'] for item in items]) + 1 if items else 1

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/categories', methods=['GET'])
def get_categories():
    data = read_data()
    return jsonify(data['categories'])

@app.route('/api/categories', methods=['POST'])
def create_category():
    data = read_data()
    new_category = request.get_json()
    new_category['id'] = get_next_id(data['categories'])
    data['categories'].append(new_category)
    write_data(data)
    return jsonify(new_category), 201

@app.route('/api/categories/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    data = read_data()
    updated_category = request.get_json()
    for category in data['categories']:
        if category['id'] == category_id:
            category.update(updated_category)
            write_data(data)
            return jsonify(category)
    return jsonify({'error': 'Category not found'}), 404

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    data = read_data()

    # Find the category to delete
    category_to_delete = None
    for category in data['categories']:
        if category['id'] == category_id:
            category_to_delete = category
            break

    if not category_to_delete:
        return jsonify({'error': 'Category not found'}), 404

    # Update subcategories to be top-level categories
    for category in data['categories']:
        if category.get('parent') == category_id:
            category['parent'] = None

    # Move associated transactions to "Uncategorized"
    for transaction in data['transactions']:
        if transaction.get('category') == category_id:
            transaction['category'] = None # Or an ID for a default "Uncategorized" category

    # Remove the category
    data['categories'] = [category for category in data['categories'] if category['id'] != category_id]

    write_data(data)

    return jsonify({'message': 'Category deleted successfully'}), 200

# Transaction Management
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    data = read_data()
    return jsonify(data['transactions'])

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    data = read_data()
    new_transaction = request.get_json()
    new_transaction['id'] = get_next_id(data['transactions'])
    data['transactions'].append(new_transaction)
    write_data(data)
    return jsonify(new_transaction), 201

@app.route('/api/transactions/<int:transaction_id>', methods=['PUT'])
def update_transaction(transaction_id):
    data = read_data()
    updated_transaction = request.get_json()
    for transaction in data['transactions']:
        if transaction['id'] == transaction_id:
            transaction.update(updated_transaction)
            write_data(data)
            return jsonify(transaction)
    return jsonify({'error': 'Transaction not found'}), 404

@app.route('/api/transactions/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    data = read_data()
    data['transactions'] = [t for t in data['transactions'] if t['id'] != transaction_id]
    write_data(data)
    return jsonify({'message': 'Transaction deleted successfully'}), 200

# Monthly View
@app.route('/api/monthly-summary', methods=['GET'])
def get_monthly_summary():
    data = read_data()
    year = int(request.args.get('year'))
    month = int(request.args.get('month'))

    transactions_in_month = [
        t for t in data['transactions']
        if datetime.strptime(t['date'], '%Y-%m-%d').year == year and
           datetime.strptime(t['date'], '%Y-%m-%d').month == month
    ]

    total_income = sum(t['amount'] for t in transactions_in_month if t['type'] == 'income')
    total_expenses = sum(t['amount'] for t in transactions_in_month if t['type'] == 'expense')

    category_breakdown = {}
    for t in transactions_in_month:
        category_id = t.get('category')
        category_name = 'Uncategorized'
        if category_id:
            for c in data['categories']:
                if c['id'] == category_id:
                    category_name = c['name']
                    break

        if category_name not in category_breakdown:
            category_breakdown[category_name] = {'income': 0, 'expense': 0}

        category_breakdown[category_name][t['type']] += t['amount']

    return jsonify({
        'total_income': total_income,
        'total_expenses': total_expenses,
        'category_breakdown': category_breakdown,
        'transactions': transactions_in_month,
    })

# CSV Upload
@app.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        data = read_data()
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_input = csv.DictReader(stream)

        errors = []
        successful_rows = 0

        for row in csv_input:
            try:
                # Data Validation (simple)
                row_type = row['type'].lower()
                if row_type not in ['income', 'expense']:
                    raise ValueError('Invalid transaction type')

                amount = float(row['amount'])
                if amount <= 0:
                    raise ValueError('Amount must be a positive number')

                # Create categories/subcategories if they don't exist
                category_name = row.get('category')
                subcategory_name = row.get('subcategory')
                transaction_category_id = None

                if category_name:
                    # Find or create parent category. We assume categories without parents are parents.
                    parent_category = next((c for c in data['categories'] if c['name'] == category_name and not c.get('parent')), None)
                    if not parent_category:
                        parent_category = {'id': get_next_id(data['categories']), 'name': category_name, 'parent': None}
                        data['categories'].append(parent_category)

                    # Default to parent category, will be overridden if subcategory exists
                    transaction_category_id = parent_category['id']

                    if subcategory_name:
                        # Find or create subcategory
                        subcategory = next((c for c in data['categories'] if c['name'] == subcategory_name and c.get('parent') == parent_category['id']), None)
                        if not subcategory:
                            subcategory = {'id': get_next_id(data['categories']), 'name': subcategory_name, 'parent': parent_category['id']}
                            data['categories'].append(subcategory)

                        # Assign the transaction to the subcategory
                        transaction_category_id = subcategory['id']

                # Add transaction
                new_transaction = {
                    'id': get_next_id(data['transactions']),
                    'date': row['date'],
                    'type': row_type,
                    'amount': amount,
                    'description': row.get('description', ''),
                    'notes': row.get('notes', ''),
                    'category': transaction_category_id,
                }
                data['transactions'].append(new_transaction)
                successful_rows += 1

            except Exception as e:
                errors.append(f"Error in row: {row} - {str(e)}")

        write_data(data)

        if errors:
            return jsonify({'message': 'CSV imported with errors', 'errors': errors, 'successful_rows': successful_rows}), 400
        else:
            return jsonify({'message': 'CSV imported successfully', 'successful_rows': successful_rows}), 200

if __name__ == '__main__':
    app.run(debug=True)
