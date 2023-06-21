'use strict';

function getIndexedPlaceholders (items, offset = 0) {
  return items.map((item, index) => '$' + (index + offset + 1)).join(', ');
}

module.exports = {
  getIndexedPlaceholders: getIndexedPlaceholders,
};
