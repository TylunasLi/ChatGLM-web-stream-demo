#! /usr/bin/python3
# -*- coding: utf-8 -*-
# ChatGLM-web-stream-demo
# Copyright (c) 2023 TylunasLi, MIT License

from fastapi import FastAPI, Request
from sse_starlette.sse import ServerSentEvent, EventSourceResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import torch
from transformers import AutoTokenizer, AutoModel
import logging
import os
import json
import sys

def getLogger(name, file_name, use_formatter=True):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    console_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s    %(message)s')
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    logger.addHandler(console_handler)
    if file_name:
        handler = logging.FileHandler(file_name, encoding='utf8')
        handler.setLevel(logging.INFO)
        if use_formatter:
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(message)s')
            handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger

logger = getLogger('ChatGLM', 'chatlog.log')

MAX_HISTORY = 5

class ChatGLM():
    def __init__(self) -> None:
        logger.info("Start initialize model...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            "THUDM/chatglm-6b", trust_remote_code=True)
        self.model = AutoModel.from_pretrained(
            "THUDM/chatglm-6b", trust_remote_code=True).half().cuda()  # .quantize(8)
        _, _ = self.model.chat(self.tokenizer, "你好", history=[])
        logger.info("Model initialization finished.")
    
    def clear(self, gpu_id) -> None:
        if torch.cuda.is_available():
            with torch.cuda.device("gpu:{}".format(gpu_id)):
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
    
    def answer(self, query: str, history):
        response, history = self.model.chat(self.tokenizer, query, history=history)
        history = [list(h) for h in history]
        return response, history

    def stream(self, query, history):
        if query is None or history is None:
            yield {"query": "", "response": "", "history": [], "finished": True}
        size = 0
        response = ""
        for response, history in self.model.stream_chat(self.tokenizer, query, history):
            this_response = response[size:]
            history = [list(h) for h in history]
            size = len(response)
            yield {"delta": this_response, "response": response, "finished": False}
        logger.info("Answer - {}".format(response))
        yield {"query": query, "delta": "[EOS]", "response": response, "history": history, "finished": True}

def start_server(http_address: str, port: int, gpu_id: str):
    os.environ['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
    os.environ['CUDA_VISIBLE_DEVICES'] = gpu_id

    bot = ChatGLM()

    app = FastAPI()
    app.add_middleware( CORSMiddleware,
        allow_origins = ["*"],
        allow_credentials = True,
        allow_methods=["*"],
        allow_headers=["*"]
    )

    @app.get("/")
    def index():
        return {'message': 'started', 'success': True}

    @app.post("/chat")
    async def answer_question(arg_dict: dict):
        result = {"query": "", "response": "", "success": False}
        try:
            text = arg_dict["query"]
            ori_history = arg_dict["history"]
            logger.info("Query - {}".format(text))
            if len(ori_history) > 0:
                logger.info("History - {}".format(ori_history))
            history = ori_history[-MAX_HISTORY:]
            history = [tuple(h) for h in history] 
            response, history = bot.answer(text, history)
            logger.info("Answer - {}".format(response))
            ori_history.append((text, response))
            result = {"query": text, "response": response,
                      "history": ori_history, "success": True}
        except Exception as e:
            logger.error(f"error: {e}")
        return result

    @app.post("/stream")
    def answer_question_stream(arg_dict: dict):
        def decorate(generator):
            for item in generator:
                yield ServerSentEvent(json.dumps(item, ensure_ascii=False), event='delta')
        result = {"query": "", "response": "", "success": False}
        try:
            text = arg_dict["query"]
            ori_history = arg_dict["history"]
            logger.info("Query - {}".format(text))
            if len(ori_history) > 0:
                logger.info("History - {}".format(ori_history))
            history = ori_history[-MAX_HISTORY:]
            history = [tuple(h) for h in history]
            return EventSourceResponse(decorate(bot.stream(text, history)))
        except Exception as e:
            logger.error(f"error: {e}")
            return EventSourceResponse(decorate(bot.stream(None, None)))

    @app.get("/clear")
    def clear():
        history = []
        try:
            bot.clear(gpu_id)
            return {"success": True}
        except Exception as e:
            return {"success": False}

    @app.get("/score")
    def score_answer(score: int):
        logger.info("score: {}".format(score))
        return {'success': True}

    logger.info("starting server...")
    uvicorn.run(app=app, host=http_address, port=port, debug = False)


if __name__ == '__main__':
    start_server('0.0.0.0', 8800, gpu_id='0')