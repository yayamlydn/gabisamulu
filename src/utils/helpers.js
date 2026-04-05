// src/utils/helpers.js

const moment = require('moment');

// Format currency IDR
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

// Format date
const formatDate = (dateStr) => {
  return moment(dateStr).format('DD/MM/YYYY HH:mm');
};

// Format relative time
const timeAgo = (dateStr) => {
  return moment(dateStr).fromNow();
};

// Generate captcha math question
const generateCaptcha = () => {
  const operators = ['+', '-', '*'];
  const op = operators[Math.floor(Math.random() * operators.length)];
  let a, b, answer;
  
  switch (op) {
    case '+':
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
      answer = a + b;
      break;
    case '-':
      a = Math.floor(Math.random() * 20) + 10;
      b = Math.floor(Math.random() * 10) + 1;
      answer = a - b;
      break;
    case '*':
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * 5) + 1;
      answer = a * b;
      break;
  }
  
  return {
    question: `Berapa hasil dari ${a} ${op} ${b}?`,
    answer: answer.toString()
  };
};

// Escape Markdown for Telegram
const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

// Status badge emoji
const statusBadge = (status) => {
  const badges = {
    pending: '🟡',
    processing: '🔵',
    completed: '✅',
    cancelled: '❌',
    failed: '🔴',
    open: '🟢',
    closed: '⚫',
    success: '✅',
    active: '🟢',
    inactive: '🔴'
  };
  return badges[status] || '⚪';
};

// Paginate array
const paginate = (array, page = 1, perPage = 10) => {
  const total = array.length;
  const totalPages = Math.ceil(total / perPage);
  const data = array.slice((page - 1) * perPage, page * perPage);
  return { data, total, totalPages, currentPage: page };
};

// Sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Truncate text
const truncate = (text, length = 50) => {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
};

module.exports = {
  formatCurrency,
  formatDate,
  timeAgo,
  generateCaptcha,
  escapeMarkdown,
  statusBadge,
  paginate,
  sleep,
  truncate
};
