## ToDo

- Export All bei Flex anschalten
- Set SchemaPWD muss die möglichen Nummern im Namen wegnehmen


// "vscode:prepublish": "npm run compile",
		// "compile": "tsc -p ./",
		// "watch": "tsc -watch -p ./",
		// "pretest": "npm run compile && npm run lint",
		// "lint": "eslint src --ext ts",
		// "test": "node ./out/test/runTest.js"





"vscode:prepublish": "npm run -S esbuild-base -- --minify",
    "esbuild-base": "esbuild ./src/extension.ts --bundle --outfile=out/main.js --external:vscode --format=cjs --platform=node",
    "esbuild": "npm run -S esbuild-base -- --sourcemap",
    "esbuild-watch": "npm run -S esbuild-base -- --sourcemap --watch",
    "test-compile": "tsc -p ./"