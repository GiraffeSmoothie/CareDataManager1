#!/bin/bash

echo "=== Deployment Structure Analysis ==="
echo ""

if [ -d "deployment-temp" ]; then
    echo "📁 deployment-temp/ structure:"
    find deployment-temp -type f | head -20
    echo ""
    
    echo "📊 File count by type:"
    echo "Total files: $(find deployment-temp -type f | wc -l)"
    echo "JS files: $(find deployment-temp -name "*.js" | wc -l)"
    echo "HTML files: $(find deployment-temp -name "*.html" | wc -l)"
    echo "CSS files: $(find deployment-temp -name "*.css" | wc -l)"
    echo ""
    
    echo "🚨 Potential issues:"
    
    # Check for duplicates
    if [ -d "deployment-temp/server" ]; then
        echo "❌ Unnecessary server/ directory found"
        ls -la deployment-temp/server/
    fi
    
    # Check for development files
    dev_files=$(find deployment-temp -name "*.ts" -o -name "*.map" -o -name "src" -o -name "tests" | wc -l)
    if [ $dev_files -gt 0 ]; then
        echo "❌ Development files found: $dev_files"
        find deployment-temp -name "*.ts" -o -name "*.map" -o -name "src" -o -name "tests"
    fi
    
    # Check for correct structure
    echo ""
    echo "✅ Required files check:"
    [ -f "deployment-temp/index.js" ] && echo "✓ index.js" || echo "❌ index.js missing"
    [ -f "deployment-temp/package.json" ] && echo "✓ package.json" || echo "❌ package.json missing"
    [ -d "deployment-temp/client" ] && echo "✓ client/" || echo "❌ client/ missing"
    [ -f "deployment-temp/client/index.html" ] && echo "✓ client/index.html" || echo "❌ client/index.html missing"
    [ -d "deployment-temp/migrations" ] && echo "✓ migrations/" || echo "❌ migrations/ missing"
    
else
    echo "❌ deployment-temp directory not found"
fi

if [ -f "deployment.zip" ]; then
    echo ""
    echo "📦 deployment.zip info:"
    ls -lh deployment.zip
else
    echo "❌ deployment.zip not found"
fi
