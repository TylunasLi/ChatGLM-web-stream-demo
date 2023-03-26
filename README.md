# ChatGLM-6B流式HTTP API示例

本工程仿造OpneAI Chat Completion API（即GPT3.5 API）的实现，为[ChatGLM-6B](https://github.com/THUDM/ChatGLM-6B)提供流式HTTP API。

本仓库提供了Flask和FastAPI下的示例服务和开箱即用的静态Web UI，无需Node.js、npm或webpack。

### 依赖（Requirements）

实际版本以ChatGLM-6B官方为准。但是这里需要提醒一下：

* 官方更新`stream_chat`方法后，已不能使用4.25.1的transformers包，故transformers==4.26.1。
* cpm_kernel需要本机安装CUDA（若torch中的CUDA使用集成方式，如各种一键安装包时，需要注意这点。）  
* 为了获得更好的性能，建议使用CUDA11.6或11.7配合PyTorch 1.13和torchvision 0.14.1。

以下为本人开发环境的配置：

```
protobuf>=3.18,<3.20.1
transformers==4.26.1
torch==1.12.1+cu113
torchvision==0.13.1
icetk
cpm_kernels
```

## 接口

**非流式接口**

* 接口URL： `http://{host_name}/chat`

* 请求方式：POST(JSON body)

* 请求参数：

  | 字段名  | 类型          | 说明         |
  | ------- | ------------- | ------------ |
  | query   | string        | 用户问题     |
  | history | array[string] | 会话历史     |

* 返回结果：

  | 字段名   | 类型          | 说明       |
  | -------- | ------------- | ---------- |
  | query    | string        | 用户问题   |
  | response | string        | 完整的回复 |
  | history  | array[string] | 会话历史   |


**流式接口**，使用[server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)技术。

* 接口URL： `http://{host_name}/stream`
* 请求方式：POST(JSON body)
* 返回方式：
  * 使用[Event Stream格式](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format)，返回服务端事件流，
  * 事件名称：`delta`
  * 数据类型：JSON

* 返回结果：

  | 字段名   | 类型          | 说明                                             |
  | -------- | ------------- | ------------------------------------------------ |
  | delta    | string        | 产生的字符                                       |
  | query    | string        | 用户问题，为省流，finished为`true`时返回         |
  | response | string        | 目前为止的回复，finished为`true`时，为完整的回复 |
  | history  | array[string] | 会话历史，为省流，finished为`true`时返回         |
  | finished | boolean       | `true` 表示结束，`false` 表示仍然有数据流。      |

**清理显存接口**

* 接口URL： `http://{host_name}/clear`
* 请求方式：GET

## Flask Demo

Flask下实现server-sent events，本可以使用`Flask-SSE`，但是由于该包依赖Redis，而这一场景下并无必要，因此参考了[这篇文档](https://maxhalford.github.io/blog/flask-sse-no-deps/)，仅用最简单的方式实现了server-sent events。

### 依赖（Requirements）

```
Flask
Flask-Cors
gevent
```

### 启动

```bash
python3 -u chatglm_service_flask.py --host 127.0.0.1 --port 8800 --quantize 8 --device 0
```


## FastAPI Demo

FastAPI可以使用`sse-starlette`创建和发送server-sent events。

注意，**sse-starlette 输出的事件流可能带有多余的符号，前端处理时需要注意**。

### 依赖（Requirements）

```
fastApi
sse-starlette
unicorn
```

### 启动

```bash
python3 -u chatglm_service_fastapi.py --host 127.0.0.1 --port 8800 --quantize 8 --device 0
```

## Web UI Demo

本仓库提供了该流式API的调用演示页面，内网环境即开即用，无需Nodejs、npm或webpack。

基于本人有限的开发环境制约和贫乏的技术储备，HTML Demo使用bootstrap.js 3.x + Vue.js 2.x开发，使用marked.js+highlight.js渲染，具体版本可参看HTML中的CDN链接。

### 关于EventSource

由于浏览器本身的EventSource实现不支持POST方法，设定请求头等能力，需要使用第三方实现替代。

若正经开发中使用NPM，可以用[@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source)实现； 

但是本人条件所限，懒得编译TypeScript，于是采用了[@rangermauve/fetch-event-source](https://github.com/RangerMauve/fetch-event-source)。不过该工程只有EventSource的最基本功能，所以又在此基础上做了魔改。

不过，使用该方式后，在Chrome的DevTools中，不能正确展现EventStream。

### 更改端口

在`static/js/chatglm.js`中修改第1行对应的端口：

```javascript
var baseUrl = "http://localhost:8800/"
```



