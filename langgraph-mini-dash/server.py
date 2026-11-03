from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Any

import os
import uvicorn
import json
import asyncio

class GraphInput(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)

class LangGraphMiniDash:
    def __init__(self, compiled_graph):
        self.graph = compiled_graph
        self.app = FastAPI(title='LangGraph Mini Dash')

        current_dir = os.path.dirname(os.path.abspath(__file__))
        self.web_dir = os.path.join(current_dir, 'web')

        self._setup_routes()

        self.app.mount(
            '/web',
            StaticFiles(directory=self.web_dir),
            name='web'
        )

    def _setup_routes(self):
        @self.app.get('/', response_class=HTMLResponse)
        def index():
            html_path = os.path.join(self.web_dir, 'index.html')

            with open(html_path, 'r', encoding='utf-8') as f:
                return f.read()

        @self.app.get('/api/graph')
        def get_graph_structure():
            internal_graph = self.graph.get_graph()

            nodes = [
                {
                    'data': {
                        'id': node_id,
                        'label': node.name or node_id
                    }
                }
                for node_id, node in internal_graph.nodes.items()
            ]

            edges = [
                {
                    'data': {
                        'source': edge.source,
                        'target': edge.target
                    }
                }
                for edge in internal_graph.edges
            ]

            return {
                'nodes': nodes,
                'edges': edges
            }

        @self.app.get('/api/schemas')
        def get_schemas():
            return self.get_graph_schemas()

        @self.app.post('/api/stream')
        async def stream_agent(request: Request, payload: GraphInput = None):
            inputs = payload.inputs if payload else {}

            async def event_generator():
                try:
                    async for chunk in self.graph.astream(
                        inputs,
                        stream_mode='updates'
                    ):
                        if await request.is_disconnected():
                            return

                        for node_name, output in chunk.items():
                            if await request.is_disconnected():
                                return

                            yield (
                                'data: '
                                + json.dumps({
                                    'node': node_name,
                                    'status': 'active'
                                }, ensure_ascii=False)
                                + '\n\n'
                            )

                            if (
                                isinstance(output, dict)
                                and 'messages' in output
                            ):
                                messages = output['messages']

                                if messages:
                                    last_msg = messages[-1]

                                    text_content = getattr(
                                        last_msg,
                                        'content',
                                        str(last_msg)
                                    )

                                    for word in str(text_content).split(' '):
                                        if await request.is_disconnected():
                                            return

                                        yield (
                                            'data: '
                                            + json.dumps({
                                                'node': node_name,
                                                'token': word + ' '
                                            }, ensure_ascii=False)
                                            + '\n\n'
                                        )

                            if await request.is_disconnected():
                                return

                            yield (
                                'data: '
                                + json.dumps({
                                    'node': node_name,
                                    'status': 'done'
                                }, ensure_ascii=False)
                                + '\n\n'
                            )

                    yield (
                        'data: '
                        + json.dumps({
                            'status': 'finished'
                        }, ensure_ascii=False)
                        + '\n\n'
                    )

                except asyncio.CancelledError:
                    raise

                except Exception as error:
                    yield (
                        'data: '
                        + json.dumps({
                            'status': 'error',
                            'message': str(error)
                        }, ensure_ascii=False)
                        + '\n\n'
                    )

            headers = {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            }

            return StreamingResponse(
                event_generator(),
                media_type='text/event-stream',
                headers=headers
            )

    def _get_schema(self, model):
        if hasattr(model, 'model_json_schema'):
            return model.model_json_schema()

        return model.schema()

    def get_graph_schemas(self):
        return {
            'input': self._get_schema(
                self.graph.get_input_schema()
            ),
            'output': self._get_schema(
                self.graph.get_output_schema()
            )
        }

    def run(self, host='127.0.0.1', port=8000):
        uvicorn.run(
            self.app,
            host=host,
            port=port
        )