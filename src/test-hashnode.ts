import { HashnodePublisher } from './publishers/HashnodePublisher';

(async () => {
    console.log('Testing Hashnode...');
    const url = await HashnodePublisher.publish('Test title', 'Test content');
    console.log('Done:', url);
})();
