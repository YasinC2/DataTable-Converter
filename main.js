class FormatConverter {
    constructor() {
        this.worker = null;
        this.files = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadTheme();
        this.setupWorker();
        this.setupAutoDetect();
        this.updateStats();
        this.toggleAdvancedSettings();
        this.toggleTreeViewButton();
    }

    bindEvents() {
        // المان‌های DOM
        this.inputFormat = document.getElementById('inputFormat');
        this.outputFormat = document.getElementById('outputFormat');
        this.inputData = document.getElementById('inputData');
        this.outputData = document.getElementById('outputData').querySelector('code');
        this.themeToggle = document.getElementById('themeToggle');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.showCodeBtn = document.getElementById('showCodeBtn');
        this.showTreeBtn = document.getElementById('showTreeBtn');
        this.codeOutput = document.getElementById('codeOutput');
        this.treeOutput = document.getElementById('treeOutput');
        this.jsonTree = document.getElementById('jsonTree');
        this.advancedSettings = document.getElementById('advancedSettings');
        this.csvDelimiter = document.getElementById('csvDelimiter');
        this.notification = document.getElementById('notification');
        this.notificationMessage = document.getElementById('notificationMessage');
        this.progressBar = document.getElementById('progressBar');
        this.detectedFormatSpan = document.getElementById('detectedFormat').querySelector('span');
        this.inputStats = document.getElementById('inputStats');
        this.outputStats = document.getElementById('outputStats');

        // Event Listeners
        this.inputData.addEventListener('input', () => this.handleInput());
        this.inputFormat.addEventListener('change', () => this.handleInput());
        this.outputFormat.addEventListener('change', () => {
            this.toggleAdvancedSettings();
            this.toggleTreeViewButton();
            this.convert();
        });
        this.csvDelimiter.addEventListener('change', () => this.convert());
        this.themeToggle.addEventListener('click', () => this.toggleTheme());

        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', (e) => e.preventDefault());
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.downloadBtn.addEventListener('click', () => this.download());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());

        this.showCodeBtn.addEventListener('click', () => this.toggleView('code'));
        this.showTreeBtn.addEventListener('click', () => this.toggleView('tree'));

        document.getElementById('helpBtn').addEventListener('click', () => this.showHelp());

        // نمونه‌های آماده
        document.querySelectorAll('.sample-chip').forEach(chip => {
            chip.addEventListener('click', () => this.loadSample(chip.dataset.sample));
        });
    }

    // تشخیص خودکار فرمت
    setupAutoDetect() {
        this.formatDetectors = {
            json: (text) => {
                try {
                    JSON.parse(text);
                    return true;
                } catch { return false; }
            },
            xml: (text) => {
                const trimmed = text.trim();
                return trimmed.startsWith('<') && trimmed.endsWith('>') && /<[^>]+>/.test(text) && /<\/[^>]+>/.test(text);
            },
            html: (text) => {
                return /<table[^>]*>[\s\S]*<\/table>/.test(text);
            },
            csv: (text) => {
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) return false;
                const cols1 = lines[0].split(',').length;
                const cols2 = lines[1].split(',').length;
                return cols1 === cols2 && cols1 > 1;
            },
            markdown: (text) => {
                return text.includes('|') && text.includes('---');
            }
        };
    }

    detectFormat(text) {
        if (!text.trim()) return 'unknown';

        for (let [format, detector] of Object.entries(this.formatDetectors)) {
            if (detector(text)) return format;
        }
        return 'unknown';
    }

    async handleInput() {
        const text = this.inputData.value;
        const format = this.inputFormat.value;

        if (format === 'auto') {
            const detected = this.detectFormat(text);
            this.detectedFormatSpan.textContent = detected.toUpperCase();
        }

        this.updateStats();
        this.convert();
    }

    // تبدیل فرمت‌ها
    async convert() {
        const inputText = this.inputData.value;
        if (!inputText.trim()) return;

        const fromFormat = this.inputFormat.value === 'auto' ?
            this.detectFormat(inputText) : this.inputFormat.value;
        const toFormat = this.outputFormat.value;

        try {
            let result = '';

            // مرحله 1: تبدیل به JSON میانی
            let intermediate = await this.parseToIntermediate(inputText, fromFormat);

            // مرحله 2: تبدیل از JSON میانی به فرمت مقصد
            result = await this.formatFromIntermediate(intermediate, toFormat);

            // نمایش خروجی
            this.outputData.textContent = result;
            if (window.hljs) {
                this.outputData.parentElement.className = `language-${toFormat}`;
                hljs.highlightElement(this.outputData);
            }

            // به‌روزرسانی آمار خروجی
            this.updateOutputStats(result);

            // ساخت نمایش درختی برای JSON
            if (toFormat === 'json') {
                this.buildTreeView(intermediate);
            }

            this.showNotification('Conversion successful', 'success');

        } catch (error) {
            console.error('Conversion error:', error);
            this.outputData.textContent = `Error: ${error.message}`;
            this.showNotification(error.message, 'error');
        }
    }

    parseToIntermediate(text, format) {
        return new Promise((resolve, reject) => {
            try {
                switch (format) {
                    case 'json':
                        resolve(JSON.parse(text));
                        break;

                    case 'csv':
                        Papa.parse(text, {
                            header: true,
                            skipEmptyLines: true,
                            complete: (result) => {
                                resolve(result.data);
                            },
                            error: (error) => reject(error)
                        });
                        break;

                    case 'xml':
                        try {
                            // تبدیل XML به آبجکت
                            const result = xml2js(text, { 
                                compact: true,
                                ignoreAttributes: false,
                                attributesKey: '_attributes',
                                textKey: '_text',
                                cdataKey: '_cdata'
                            });
                            
                            // استخراج و پردازش داده‌های XML
                            const processed = this.extractXmlData(result);
                            resolve(processed);
                        } catch (xmlError) {
                            reject(new Error(`XML parsing error: ${xmlError.message}`));
                        }
                        break;

                    case 'html':
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        const table = doc.querySelector('table');
                        if (!table) throw new Error('HTML table not found');

                        const data = [];
                        const rows = table.querySelectorAll('tr');
                        const headers = [];

                        // استخراج هدرها
                        rows[0].querySelectorAll('th, td').forEach(th => {
                            headers.push(th.textContent.trim());
                        });

                        // استخراج داده‌ها
                        for (let i = 1; i < rows.length; i++) {
                            const row = {};
                            const cells = rows[i].querySelectorAll('td');
                            if (cells.length > 0) {
                                cells.forEach((cell, j) => {
                                    if (j < headers.length) {
                                        row[headers[j]] = cell.textContent.trim();
                                    }
                                });
                                data.push(row);
                            }
                        }
                        resolve(data);
                        break;

                    case 'markdown':
                        const lines = text.split('\n').filter(l => l.trim() && !l.includes('---'));
                        if (lines.length < 2) throw new Error('Invalid markdown table');
                        
                        const headers_md = lines[0].split('|').filter(h => h.trim()).map(h => h.trim());
                        const data_md = [];

                        for (let i = 1; i < lines.length; i++) {
                            const cells = lines[i].split('|').filter(c => c.trim()).map(c => c.trim());
                            if (cells.length === headers_md.length) {
                                const row = {};
                                cells.forEach((cell, j) => {
                                    row[headers_md[j]] = cell;
                                });
                                data_md.push(row);
                            }
                        }
                        resolve(data_md);
                        break;

                    default:
                        reject(new Error('Unknown format'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // استخراج داده از ساختار XML
    extractXmlData(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        // پیدا کردن کلید اصلی (معمولاً root)
        const rootKey = Object.keys(obj)[0];
        if (!rootKey) return [];

        const rootData = obj[rootKey];
        
        // استخراج آیتم‌های تکراری
        const items = [];
        
        const extractItems = (data) => {
            if (Array.isArray(data)) {
                return data.map(item => extractItems(item));
            }
            
            if (data && typeof data === 'object') {
                // بررسی برای یافتن آرایه‌ای از آیتم‌ها
                for (let key in data) {
                    const value = data[key];
                    
                    // اگر مقدار آرایه است
                    if (Array.isArray(value)) {
                        return value.map(item => this.extractItemFields(item));
                    }
                    
                    // اگر مقدار آبجکت است
                    if (value && typeof value === 'object') {
                        // اگر کلید به صورت جمع است (مثلاً products -> product)
                        if (key.endsWith('s') && data[key]) {
                            const singular = key.slice(0, -1);
                            if (data[singular]) {
                                const result = this.extractItemFields(data[singular]);
                                if (Object.keys(result).length > 0) {
                                    items.push(result);
                                }
                            }
                        }
                        
                        const result = extractItems(value);
                        if (Array.isArray(result)) {
                            return result;
                        }
                    }
                }
            }
            
            return data;
        };

        const extracted = extractItems(rootData);
        
        // اگر extracted آرایه است، همان را برگردان
        if (Array.isArray(extracted)) {
            return extracted;
        }
        
        // اگر extracted آبجکت است، به عنوان یک آیتم در نظر بگیر
        if (extracted && typeof extracted === 'object') {
            return [this.extractItemFields(extracted)];
        }
        
        return [];
    }

    // استخراج فیلدهای یک آیتم
    extractItemFields(item) {
        if (typeof item !== 'object' || item === null) {
            return { value: String(item) };
        }

        const result = {};
        
        for (let [key, value] of Object.entries(item)) {
            // نادیده گرفتن کلیدهای خاص
            if (key === '_attributes' || key === '_declaration' || key === '_instruction') {
                continue;
            }

            // استخراج متن از ساختار xml-js
            if (value && typeof value === 'object') {
                if (value._text !== undefined) {
                    // اگر _text آرایه است
                    if (Array.isArray(value._text)) {
                        result[key] = value._text.join(' ');
                    } else {
                        result[key] = value._text;
                    }
                } else if (value._cdata !== undefined) {
                    result[key] = value._cdata;
                } else if (Array.isArray(value)) {
                    // اگر آرایه است، اولین آیتم رو بردار
                    if (value.length > 0) {
                        const firstItem = this.extractItemFields(value[0]);
                        result[key] = Object.values(firstItem)[0] || '';
                    }
                } else {
                    // اگر آبجکت ساده است، همه فیلدهای داخلی رو استخراج کن
                    const nested = this.extractItemFields(value);
                    if (Object.keys(nested).length === 1) {
                        // اگر فقط یک فیلد داره، مقدار اون رو مستقیماً بذار
                        result[key] = Object.values(nested)[0];
                    } else {
                        result[key] = nested;
                    }
                }
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    formatFromIntermediate(data, format) {
        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);

            case 'csv':
                const delimiter = this.csvDelimiter.value || ",";
                
                // تبدیل داده به آرایه‌ای از آبجکت‌های ساده
                let csvData = this.convertToTableData(data);
                
                if (csvData.length === 0) return '';
                
                return Papa.unparse(csvData, { 
                    delimiter,
                    quotes: false,
                    skipEmptyLines: true
                });

            case 'xml':
                try {
                    const options = {
                        compact: true,
                        spaces: 2,
                        ignoreDeclaration: false,
                        declaration: {
                            encoding: 'UTF-8'
                        }
                    };
                    
                    // ساختار مناسب برای XML
                    let xmlData = data;
                    if (Array.isArray(data) && data.length > 0) {
                        xmlData = { root: { item: data } };
                    } else if (typeof data === 'object' && !Array.isArray(data)) {
                        xmlData = { root: data };
                    } else {
                        xmlData = { root: { value: data } };
                    }
                    
                    return js2xml(xmlData, options);
                } catch (xmlError) {
                    throw new Error(`XML generation error: ${xmlError.message}`);
                }

            case 'html':
                // تبدیل داده به فرمت جدولی
                let htmlData = this.convertToTableData(data);
                
                if (htmlData.length === 0) return '<table></table>';
                
                // استخراج هدرها
                const headers_html = this.extractHeaders(htmlData);

                let html = '<table border="1" style="border-collapse: collapse; width: 100%;">\n';
                html += '  <thead>\n    <tr>\n';
                headers_html.forEach(h => {
                    html += `      <th>${h}</th>\n`;
                });
                html += '    </tr>\n  </thead>\n  <tbody>\n';

                htmlData.forEach(row => {
                    html += '    <tr>\n';
                    headers_html.forEach(h => {
                        const value = row[h] !== undefined && row[h] !== null ? row[h] : '';
                        html += `      <td>${value}</td>\n`;
                    });
                    html += '    </tr>\n';
                });
                html += '  </tbody>\n</table>';
                return html;

            case 'markdown':
                // تبدیل داده به فرمت جدولی
                let mdData = this.convertToTableData(data);
                
                if (mdData.length === 0) return '';
                
                // استخراج هدرها
                const headers_md = this.extractHeaders(mdData);

                let markdown = '| ' + headers_md.join(' | ') + ' |\n';
                markdown += '|' + headers_md.map(() => ' --- ').join('|') + '|\n';

                mdData.forEach(row => {
                    markdown += '| ';
                    headers_md.forEach(h => {
                        const value = row[h] !== undefined && row[h] !== null ? row[h] : '';
                        markdown += value + ' | ';
                    });
                    markdown += '\n';
                });
                return markdown;

            default:
                throw new Error('Invalid output format');
        }
    }

    // تبدیل داده به فرمت مناسب برای جدول
    convertToTableData(data) {
        if (!data) return [];
        
        // اگر آرایه نیست
        if (!Array.isArray(data)) {
            // اگر آرایه‌ای از آبجکت‌ها داخل آبجکت هست
            if (data && typeof data === 'object') {
                for (let key in data) {
                    if (Array.isArray(data[key])) {
                        // بررسی کن که آیا آیتم‌های آرایه آبجکت هستند
                        if (data[key].length > 0 && typeof data[key][0] === 'object') {
                            return data[key].map(item => this.flattenObject(item));
                        }
                        // اگر آرایه‌ای از مقادیر ساده است
                        return data[key].map(value => ({ [key]: value }));
                    }
                }
            }
            return [this.flattenObject(data)];
        }
        
        // اگر آرایه است
        return data.map(item => this.flattenObject(item));
    }

    // صاف کردن آبجکت‌های تو در تو
    flattenObject(obj, prefix = '') {
        if (typeof obj !== 'object' || obj === null) {
            return { value: obj };
        }

        if (Array.isArray(obj)) {
            return { value: obj.join(', ') };
        }

        const result = {};
        
        for (let [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // اگر فقط یک کلید داره و اون کلید _text یا value هست
                const keys = Object.keys(value);
                if (keys.length === 1 && (keys[0] === '_text' || keys[0] === 'value')) {
                    result[newKey] = value[keys[0]];
                } else {
                    // آبجکت تو در تو
                    const flattened = this.flattenObject(value);
                    for (let [k, v] of Object.entries(flattened)) {
                        result[`${newKey}.${k}`] = v;
                    }
                }
            } else if (Array.isArray(value)) {
                // اگر آرایه‌ای از مقادیر ساده است
                if (value.length > 0 && typeof value[0] !== 'object') {
                    result[newKey] = value.join(', ');
                } else {
                    result[newKey] = JSON.stringify(value);
                }
            } else {
                result[newKey] = value;
            }
        }

        return result;
    }

    // استخراج هدرها از داده
    extractHeaders(data) {
        if (!Array.isArray(data) || data.length === 0) return ['value'];
        
        const allKeys = new Set();
        data.forEach(item => {
            if (item && typeof item === 'object') {
                Object.keys(item).forEach(key => allKeys.add(key));
            }
        });
        
        return Array.from(allKeys);
    }

    // نمایش درختی JSON
    buildTreeView(obj, element = null, level = 0) {
        if (!element) {
            this.jsonTree.innerHTML = '';
            element = this.jsonTree;
        }

        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                if (obj.length === 0) {
                    element.textContent = '[]';
                    return;
                }
                
                obj.forEach((item, index) => {
                    const details = document.createElement('details');
                    details.className = 'tree-node';
                    details.open = level < 2;

                    const summary = document.createElement('summary');
                    summary.textContent = `[${index}]`;
                    details.appendChild(summary);

                    this.buildTreeView(item, details, level + 1);
                    element.appendChild(details);
                });
            } else {
                if (Object.keys(obj).length === 0) {
                    element.textContent = '{}';
                    return;
                }
                
                Object.entries(obj).forEach(([key, value]) => {
                    const details = document.createElement('details');
                    details.className = 'tree-node';
                    details.open = level < 1;

                    const summary = document.createElement('summary');
                    if (typeof value === 'object' && value !== null) {
                        summary.textContent = `${key}: ${Array.isArray(value) ? '[...]' : '{...}'}`;
                    } else {
                        summary.textContent = `${key}: ${value}`;
                    }
                    details.appendChild(summary);

                    if (typeof value === 'object' && value !== null) {
                        this.buildTreeView(value, details, level + 1);
                    }
                    element.appendChild(details);
                });
            }
        } else {
            element.textContent = String(obj);
        }
    }

    // آپلود فایل
    handleDrop(e) {
        e.preventDefault();
        this.handleFiles(e.dataTransfer.files);
    }

    handleFileSelect(e) {
        this.handleFiles(e.target.files);
    }

    handleFiles(files) {
        if (files.length > 1) {
            this.files = Array.from(files);
            this.batchConvert();
        } else {
            const file = files[0];
            const reader = new FileReader();

            reader.onload = (e) => {
                this.inputData.value = e.target.result;

                // تشخیص فرمت از پسوند
                const ext = file.name.split('.').pop().toLowerCase();
                const formatMap = {
                    'json': 'json',
                    'csv': 'csv',
                    'xml': 'xml',
                    'html': 'html',
                    'md': 'markdown',
                    'txt': 'auto'
                };

                if (formatMap[ext]) {
                    this.inputFormat.value = formatMap[ext];
                }

                this.handleInput();
                this.showNotification(`File ${file.name} loaded successfully`, 'success');
            };

            reader.readAsText(file);
        }
    }

    // تبدیل دسته‌ای
    async batchConvert() {
        this.progressBar.classList.add('active');
        const zip = new JSZip();

        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const content = await file.text();

            try {
                const intermediate = await this.parseToIntermediate(content,
                    this.inputFormat.value === 'auto' ? this.detectFormat(content) : this.inputFormat.value);
                const result = await this.formatFromIntermediate(intermediate, this.outputFormat.value);

                const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.' + this.getExtension(this.outputFormat.value);
                zip.file(newFileName, result);
            } catch (error) {
                console.error(`Error converting ${file.name}:`, error);
            }
        }

        const zipContent = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipContent);
        link.download = 'converted_files.zip';
        link.click();

        this.progressBar.classList.remove('active');
        this.showNotification('Batch conversion completed', 'success');
    }

    getExtension(format) {
        const map = {
            'json': 'json',
            'csv': 'csv',
            'xml': 'xml',
            'html': 'html',
            'markdown': 'md'
        };
        return map[format] || 'txt';
    }

    // دانلود فایل
    download() {
        const content = this.outputData.textContent;
        const format = this.outputFormat.value;
        const ext = this.getExtension(format);

        const blob = new Blob([content], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `output.${ext}`;
        link.click();
    }

    // کپی به کلیپ‌بورد
    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.outputData.textContent);
            this.showNotification('Copied!', 'success');
        } catch (err) {
            this.showNotification('Copy failed', 'error');
        }
    }

    // نمایش/مخفی کردن نمایش درختی
    toggleView(view) {
        if (view === 'code') {
            this.codeOutput.style.display = 'block';
            this.treeOutput.style.display = 'none';
            this.showCodeBtn.style.background = 'var(--accent)';
            this.showCodeBtn.style.color = 'white';
            this.showTreeBtn.style.background = 'var(--bg-primary)';
            this.showTreeBtn.style.color = 'var(--text-primary)';
        } else {
            this.codeOutput.style.display = 'none';
            this.treeOutput.style.display = 'block';
            this.showTreeBtn.style.background = 'var(--accent)';
            this.showTreeBtn.style.color = 'white';
            this.showCodeBtn.style.background = 'var(--bg-primary)';
            this.showCodeBtn.style.color = 'var(--text-primary)';
        }
    }

    // نمایش/مخفی کردن دکمه نمایش درختی
    toggleTreeViewButton() {
        const isJsonOutput = this.outputFormat.value === 'json';
        this.showTreeBtn.style.display = isJsonOutput ? 'inline-flex' : 'none';
        
        // اگر خروجی JSON نیست، حتماً نمای کد نمایش داده شود
        if (!isJsonOutput) {
            this.toggleView('code');
        }
    }

    // نمایش/مخفی کردن تنظیمات پیشرفته
    toggleAdvancedSettings() {
        const isCsvOutput = this.outputFormat.value === 'csv';
        if (isCsvOutput) {
            this.advancedSettings.classList.add('show');
        } else {
            this.advancedSettings.classList.remove('show');
        }
    }

    // آمار ورودی
    updateStats() {
        const text = this.inputData.value;
        const size = new Blob([text]).size;
        const lines = text.split('\n').length;
        const words = text.split(/\s+/).filter(w => w).length;

        this.inputStats.innerHTML = `
            <span><i class="fas fa-database"></i> Size: ${this.formatBytes(size)}</span>
            <span><i class="fas fa-list"></i> Lines: ${lines}</span>
            <span><i class="fas fa-font"></i> Words: ${words}</span>
        `;
    }

    // آمار خروجی
    updateOutputStats(content) {
        const size = new Blob([content]).size;
        
        this.outputStats.innerHTML = `
            <span><i class="fas fa-database"></i> Size: ${this.formatBytes(size)}</span>
            <span><i class="fas fa-check-circle"></i> Status: Ready</span>
        `;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // نمونه‌های آماده
    loadSample(type) {
        const samples = {
            json: JSON.stringify([
                { name: "Product 1", price: 25000, stock: 10 },
                { name: "Product 2", price: 35000, stock: 5 },
                { name: "Product 3", price: 42000, stock: 8 }
            ], null, 2),

            csv: `name,price,stock
Product 1,25000,10
Product 2,35000,5
Product 3,42000,8`,

            xml: `<products>
    <product>
        <name>Product 1</name>
        <price>25000</price>
        <stock>10</stock>
    </product>
    <product>
        <name>Product 2</name>
        <price>35000</price>
        <stock>5</stock>
    </product>
    <product>
        <name>Product 3</name>
        <price>42000</price>
        <stock>8</stock>
    </product>
</products>`,

            html: `<table>
    <tr>
        <th>name</th>
        <th>price</th>
        <th>stock</th>
    </tr>
    <tr>
        <td>Product 1</td>
        <td>25000</td>
        <td>10</td>
    </tr>
    <tr>
        <td>Product 2</td>
        <td>35000</td>
        <td>5</td>
    </tr>
    <tr>
        <td>Product 3</td>
        <td>42000</td>
        <td>8</td>
    </tr>
</table>`,

            markdown: `| name | price | stock |
| --- | --- | --- |
| Product 1 | 25000 | 10 |
| Product 2 | 35000 | 5 |
| Product 3 | 42000 | 8 |`
        };

        if (samples[type]) {
            this.inputData.value = samples[type];
            this.inputFormat.value = type;
            this.handleInput();
            this.showNotification(`Sample ${type.toUpperCase()} loaded`, 'success');
        }
    }

    // تم
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = this.themeToggle.querySelector('i');
        const text = this.themeToggle.querySelector('span');

        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
            text.textContent = 'Light Mode';
        } else {
            icon.className = 'fas fa-moon';
            text.textContent = 'Dark Mode';
        }
    }

    // Web Worker برای پردازش سنگین
    setupWorker() {
        if (window.Worker) {
            const workerCode = `
                self.onmessage = function(e) {
                    const { type, data } = e.data;
                    try {
                        if (type === 'convert') {
                            let result = data;
                            self.postMessage({ success: true, result });
                        }
                    } catch (error) {
                        self.postMessage({ success: false, error: error.message });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));

            this.worker.onmessage = (e) => {
                if (e.data.success) {
                    // به‌روزرسانی UI
                }
            };
        }
    }

    // نوتیفیکیشن
    showNotification(message, type = 'success') {
        this.notificationMessage.textContent = message;
        this.notification.style.display = 'flex';
        this.notification.style.borderRightColor = type === 'success' ? 'var(--success)' : 'var(--error)';

        setTimeout(() => {
            this.notification.style.display = 'none';
        }, 3000);
    }

    // راهنما
    showHelp() {
        const helpText = `
✨ Tool Usage Guide:

1. Select input format or use "Auto Detect"
2. Enter data in the left panel or upload a file
3. Select desired output format
4. The conversion result appears on the right

🎯 Features:
- Auto format detection
- Tree view for JSON
- Batch file conversion
- Dark/Light theme support
- Sample data for learning
        `;

        alert(helpText);
    }
}

// راه‌اندازی برنامه
document.addEventListener('DOMContentLoaded', () => {
    new FormatConverter();
});