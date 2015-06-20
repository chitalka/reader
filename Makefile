# On development servers we have to use versioned node and a unix-socket.
# Otherwise (for local development) we use the /usr/bin/node and a web-socket (localhost:<port>).
# Bellow you can see this detection.
SERVER_NODE := /opt/nodejs/0.10/bin/node
SERVER_NPM := /opt/nodejs/0.10/bin/npm
LOCAL_NODE := node
LOCAL_NPM := npm

NODE := $(firstword $(shell which $(SERVER_NODE) $(LOCAL_NODE)))
NPM := $(firstword $(shell which $(SERVER_NPM) $(LOCAL_NPM)))

# if server node isn't found then specify PORT for local development
ifneq ($(NODE),$(SERVER_NODE))
    PORT ?= 8080
endif

NODE_MODULES_BIN := node_modules/.bin
ENB := $(NODE_MODULES_BIN)/enb
#MOCHA_FLAGS ?= -R dot

all: npm build

# Install npm modules
npm:
	@$(NPM) install

# Build project
build:
	$(ENB) make $(ENB_FLAGS)
	@cp -r lib build/index/lib
	@mv build/index/index.ru.html build/index/index.html

# Clean build results
clean:
	$(ENB) make clean

.PHONY: all install build clean
